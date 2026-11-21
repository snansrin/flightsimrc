import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const masonry = ['#b5a48f', '#c3b9a6', '#a7907e', '#abaca3', '#977d72']
const roofing = ['#666c69', '#865e4d', '#707f83', '#91816d', '#585b5a']

function roofGeometry(corners: THREE.Vector2[], eaves: number, rise: number) {
  const edge = corners[0].distanceToSquared(corners[1]) >= corners[1].distanceToSquared(corners[2]) ? 0 : 1
  const [a, b, c, d] = corners.map((_, index) => corners[(index + edge) % 4])
  const world = (point: THREE.Vector2, height: number) => new THREE.Vector3(point.x, height, -point.y)
  const A = world(a, eaves), B = world(b, eaves), C = world(c, eaves), D = world(d, eaves)
  const ridgeLeft = world(a.clone().lerp(d, .5), eaves + rise).lerp(world(b.clone().lerp(c, .5), eaves + rise), .17)
  const ridgeRight = world(b.clone().lerp(c, .5), eaves + rise).lerp(world(a.clone().lerp(d, .5), eaves + rise), .17)
  const points: number[] = []
  for (const [left, middle, right] of [[A, B, ridgeRight], [A, ridgeRight, ridgeLeft], [D, ridgeLeft, ridgeRight],
    [D, ridgeRight, C], [A, ridgeLeft, D], [B, C, ridgeRight]]) {
    left.toArray(points, points.length)
    const up = middle.clone().sub(left).cross(right.clone().sub(left)).y > 0
    const second = up ? middle : right
    const third = up ? right : middle
    second.toArray(points, points.length)
    third.toArray(points, points.length)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(points.length / 3 * 2), 2))
  geometry.computeVertexNormals()
  return geometry
}

export function buildingMesh(outline: THREE.Vector2[], holes: THREE.Vector2[][],
  base: number, foundation: number, height: number, seed: number, sourceColor: unknown) {
  if (outline.length < 3) return null
  const corners = outline[0].distanceToSquared(outline.at(-1)!) < .0001 ? outline.slice(0, -1) : outline
  const area = Math.abs(THREE.ShapeUtils.area(corners))
  if (area < 12) return null
  const shaft = height > 25
  const variant = seed % masonry.length
  const facade = typeof sourceColor === 'string' && /^#[0-9a-f]{6}$/i.test(sourceColor) ? sourceColor
    : shaft && variant < 2 ? '#829297' : masonry[variant]
  const wall = new THREE.Color(facade)
  const roof = new THREE.Color(roofing[variant])
  const isRectangle = corners.length === 4 && corners.every((corner, i) => {
    const a = corners[(i + 1) % 4].clone().sub(corner).normalize()
    const b = corners[(i + 3) % 4].clone().sub(corner).normalize()
    return Math.abs(a.dot(b)) < .22
  })
  const rise = isRectangle && !holes.length && height < 15 && height > 3.5 && area < 620
    ? Math.min(height * .31, Math.sqrt(area) * .21) : 0
  const eaves = base + height - rise
  const shape = new THREE.Shape(corners)
  shape.holes = holes.map(hole => new THREE.Path(hole))
  const body = new THREE.ExtrudeGeometry(shape, { depth: height - rise + foundation, bevelEnabled: false })
  body.rotateX(-Math.PI / 2)
  body.translate(0, base - foundation, 0)

  const paint = (geometry: THREE.BufferGeometry, roofOnly: boolean) => {
    const points = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
    const colors = new Float32Array(points.count * 3), projection = new Float32Array(points.count * 3)
    for (let i = 0; i < points.count; i++) {
      const isRoof = roofOnly || Math.abs(normals.getY(i)) > .77
      const paint = isRoof ? roof : wall
      paint.toArray(colors, i * 3)
      projection[i * 3] = points.getX(i) * normals.getZ(i) - points.getZ(i) * normals.getX(i)
      projection[i * 3 + 1] = points.getY(i) - base
      projection[i * 3 + 2] = isRoof ? 0 : shaft ? 2 : 1
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('buildingSurface', new THREE.BufferAttribute(projection, 3))
  }
  paint(body, false)
  if (!rise) return body
  const roofMesh = roofGeometry(corners, eaves, rise)
  paint(roofMesh, true)
  const merged = mergeGeometries([body, roofMesh])
  if (!merged) { roofMesh.dispose(); return body }
  body.dispose()
  roofMesh.dispose()
  return merged
}

export function addFacadeDetails(shader: Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0]) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 buildingSurface;\nvarying vec3 vBuildingSurface;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBuildingSurface = buildingSurface;')
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBuildingSurface;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 surface = vBuildingSurface;
      if (surface.z > .5 && surface.y > .7) {
        float tower = step(1.5, surface.z);
        vec2 bays = vec2(surface.x / mix(3.0, 2.45, tower), surface.y / mix(3.05, 3.4, tower));
        vec2 cell = abs(fract(bays) - .5);
        float pane = (1.0 - smoothstep(.23, .32, cell.x)) * (1.0 - smoothstep(.23, .32, cell.y));
        float sill = 1.0 - smoothstep(.04, .075, abs(fract(bays.y) - .13));
        float detail = 1.0 - smoothstep(160.0, 1250.0, length(vViewPosition));
        vec3 glass = mix(vec3(.085, .14, .17), vec3(.13, .23, .29), tower);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - sill * detail * .17), glass, pane * detail * .8);
      }
    `)
}
