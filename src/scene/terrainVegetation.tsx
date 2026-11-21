import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { classifyRings, type VectorTileLayer } from '@mapbox/vector-tile'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type TerrainTree = { x: number; y: number; z: number; size: number; tint: number }
type Point = { x: number; y: number }
const saturate = (value: number) => value - Math.floor(value)
const variation = (x: number, y: number) => saturate(Math.sin(x * 23.1427 + y * 117.981) * 9741.278)

function withinRing(x: number, y: number, ring: Point[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    if ((a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)) inside = !inside
  }
  return inside
}

export function* treesInTile(layer: VectorTileLayer | undefined, toLocal: (x: number, y: number, extent: number) => [number, number],
  height: (x: number, south: number) => number, bound: number, blocked?: (x: number, south: number) => boolean): Generator<void, TerrainTree[]> {
  if (!layer) return []
  const plants: TerrainTree[] = []
  const spacing = 32
  const occupied = new Set<string>()
  let candidates = 0
  for (let i = 0; i < layer.length && plants.length < 380 && candidates < 6800; i++) {
    const feature = layer.feature(i)
    if (feature.type !== 3 || feature.properties.class !== 'wood') continue
    const convert = (ring: Point[]) => ring.map(({ x, y }) => {
      const [east, south] = toLocal(x, y, feature.extent)
      return { x: east, y: south }
    })
    const [west, north] = toLocal(0, 0, feature.extent)
    const [east, south] = toLocal(feature.extent, feature.extent, feature.extent)
    for (const [outline, ...holes] of classifyRings(feature.loadGeometry())) {
      const ring = convert(outline), inner = holes.map(convert)
      const extent = ring.reduce((box, point) => box.expandByPoint(new THREE.Vector2(point.x, point.y)), new THREE.Box2())
      const minX = Math.max(-bound, west, extent.min.x), maxX = Math.min(bound, east, extent.max.x)
      const minY = Math.max(-bound, north, extent.min.y), maxY = Math.min(bound, south, extent.max.y)
      for (let column = Math.ceil(minX / spacing); column * spacing < maxX && candidates < 6800 && plants.length < 380; column++) {
        yield
        for (let row = Math.ceil(minY / spacing); row * spacing < maxY && candidates < 6800 && plants.length < 380; row++) {
          candidates++
          const shade = variation(column, row)
          const x = (column + .78 * shade) * spacing, y = (row + .78 * variation(row, column + 5)) * spacing
          const key = column + ':' + row
          if (x >= maxX || y >= maxY || occupied.has(key) || blocked?.(x, y)) continue
          if (!withinRing(x, y, ring) || inner.some(hole => withinRing(x, y, hole))) continue
          occupied.add(key)
          plants.push({ x, y: height(x, y), z: -y, size: 5.7 + shade * 5.6, tint: shade })
        }
      }
    }
  }
  return plants
}

export function TerrainTrees({ trees }: { trees: TerrainTree[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null), crowns = useRef<THREE.InstancedMesh>(null)
  const foliage = useMemo(() => {
    const lobes = [
      new THREE.IcosahedronGeometry(1, 1).scale(.82, .87, .78).translate(-.37, -.12, .03),
      new THREE.IcosahedronGeometry(1, 1).scale(.78, .79, .73).translate(.33, -.08, -.22),
      new THREE.IcosahedronGeometry(1, 1).scale(.68, .73, .7).translate(.02, .33, .26),
    ]
    const crown = mergeGeometries(lobes)!
    for (const lobe of lobes) lobe.dispose()
    return crown
  }, [])
  useEffect(() => () => foliage.dispose(), [foliage])
  useEffect(() => {
    if (!trunks.current || !crowns.current) return
    const tree = new THREE.Object3D(), color = new THREE.Color()
    trees.forEach(({ x, y, z, size, tint }, index) => {
      tree.position.set(x, y + size * .29, z)
      tree.scale.set(size * .037, size * .58, size * .037)
      tree.updateMatrix()
      trunks.current!.setMatrixAt(index, tree.matrix)
      tree.position.y = y + size * .67
      tree.scale.set(size * (.21 + tint * .06), size * .36, size * .23)
      tree.rotation.y = tint * Math.PI * 2
      tree.updateMatrix()
      crowns.current!.setMatrixAt(index, tree.matrix)
      crowns.current!.setColorAt(index, color.set('#54704a').multiplyScalar(.72 + tint * .42))
    })
    for (const mesh of [trunks.current, crowns.current]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [trees])
  return <>
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]}>
      <cylinderGeometry args={[.65, 1, 1, 6]} /><meshLambertMaterial color="#695946" />
    </instancedMesh>
    <instancedMesh ref={crowns} args={[foliage, undefined, trees.length]} name="OpenStreetMap wooded areas">
      <meshLambertMaterial />
    </instancedMesh>
  </>
}
