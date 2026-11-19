import { useEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import type { Field } from '../sim/fields'

const palettes: Record<Field['biome'], { ground: string; sky: string; foliage: string }> = {
  grass: { ground: '#9daa84', sky: '#a9c6d3', foliage: '#547555' },
  coast: { ground: '#b6ad7a', sky: '#aecddc', foliage: '#62774c' },
  alpine: { ground: '#8c9d8b', sky: '#b7cdd8', foliage: '#435f4a' },
  desert: { ground: '#d6ba89', sky: '#c5d8dc', foliage: '#776e45' },
  snow: { ground: '#e3e9ed', sky: '#c2d2dd', foliage: '#3f635f' },
  city: { ground: '#979c87', sky: '#b0becc', foliage: '#576d43' },
  island: { ground: '#a8aa75', sky: '#b5d2de', foliage: '#56805a' },
}

function prepareTexture(texture: THREE.Texture, repeatX: number, repeatY: number, color = false) {
  const copy = texture.clone()
  copy.needsUpdate = true
  if (color) copy.colorSpace = THREE.SRGBColorSpace
  copy.anisotropy = 8
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping
  copy.repeat.set(repeatX, repeatY)
  return copy
}

function terrainMesh(field: Field) {
  const geometry = new THREE.PlaneGeometry(1600, 1600, 160, 160)
  geometry.rotateX(-Math.PI / 2)
  const points = geometry.getAttribute('position')
  const tint = new Float32Array(points.count * 3)
  const color = new THREE.Color()
  const palette = palettes[field.biome]
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i)
    const height = field.height(x, -z)
    points.setY(i, height)
    const detail = Math.sin(x * .091) * Math.cos(z * .069)
    color.set(palette.ground).multiplyScalar(.86 + .13 * detail)
    if (field.biome === 'alpine' && height > 50) color.lerp(new THREE.Color('#e1ebed'), Math.min(1, (height - 50) / 40))
    if (field.biome === 'coast' && height < 1.1 && height > field.waterLevel && x > field.clearing) color.set('#d9c397')
    color.toArray(tint, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3))
  geometry.computeVertexNormals()
  return geometry
}

function FieldScenery({ field }: { field: Field }) {
  const canopy = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  const buildings = useRef<THREE.InstancedMesh>(null)
  const trees = useMemo(() => Array.from({ length: field.trees }, (_, index) => {
    const angle = (index + field.seed) * 2.399963
    const distance = 27 + 445 * ((index * .618034 + field.seed * .035) % 1)
    const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance
    return { x, z, y: field.height(x, -z), size: 1.8 + (index % 6) * .47 }
  }).filter(tree => Math.abs(tree.x) > field.runway.width / 2 + 15 && tree.y >= field.waterLevel), [field])
  const blocks = useMemo(() => Array.from({ length: field.buildings }, (_, index) => {
    const side = index % 2 ? -1 : 1
    const x = side * (field.runway.width / 2 + 12 + 15 * Math.floor(index / 12))
    const z = ((index % 12) - 5.5) * 17 + (side === 1 ? 8 : 0)
    const y = field.height(x, -z)
    return { x, y, z, height: field.biome === 'city' ? 5 + (index % 9) * 2.4 : 3 + index % 3 * .65 }
  }).filter(block => block.y >= field.waterLevel && field.runway.surface !== 'water'), [field])
  useEffect(() => {
    const object = new THREE.Object3D()
    const color = new THREE.Color()
    const setTreeMatrix = (mesh: THREE.InstancedMesh | null, index: number) => {
      object.updateMatrix()
      mesh?.setMatrixAt(index, object.matrix)
    }
    trees.forEach(({ x, y, z, size }, i) => {
      object.position.set(x, y + size * .45, z)
      object.scale.set(size * .05, size * .9, size * .05)
      setTreeMatrix(trunks.current, i)
      object.position.y = y + size * .94
      object.scale.set(size * .5, size * .68, size * .5)
      setTreeMatrix(canopy.current, i)
      canopy.current?.setColorAt(i, color.set(palettes[field.biome].foliage).multiplyScalar(.78 + (i % 7) * .055))
    })
    blocks.forEach(({ x, y, z, height }, i) => {
      object.position.set(x, y + height / 2, z)
      object.scale.set(7 + i % 3, height, 5 + i % 4)
      setTreeMatrix(buildings.current, i)
      buildings.current?.setColorAt(i, color.set(i % 2 ? '#c3bcaf' : '#77898d'))
    })
    for (const mesh of [canopy.current, trunks.current, buildings.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [trees, blocks, field.biome])
  return <>
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
      <cylinderGeometry args={[.75, 1, 1, 6]} /><meshStandardMaterial color="#564b3d" />
    </instancedMesh>
    <instancedMesh ref={canopy} args={[undefined, undefined, trees.length]} castShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={.94} />
    </instancedMesh>
    {blocks.length > 0 && <instancedMesh ref={buildings} args={[undefined, undefined, blocks.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={.76} />
    </instancedMesh>}
  </>
}

export function airfieldPilotPosition(field: Field): [number, number, number] {
  const { center, heading, width, length } = field.runway
  const angle = THREE.MathUtils.degToRad(heading)
  const lateral = width / 2 + 7
  const back = length * .3
  const x = center[0] + Math.cos(angle) * lateral - Math.sin(angle) * back
  const z = -center[1] - Math.sin(angle) * lateral - Math.cos(angle) * back
  return [x, Math.max(field.height(x, -z), field.waterLevel) + 1.7, z]
}

function Windsock({ field }: { field: Field }) {
  const [x, y, z] = airfieldPilotPosition(field)
  return <group position={[x + 3, y - 1.7, z]} rotation={[0, THREE.MathUtils.degToRad(270 + field.weather.windDirection), 0]}>
    <mesh position={[0, 1.45, 0]}><cylinderGeometry args={[.024, .037, 2.9, 8]} /><meshStandardMaterial color="#cbd2d1" /></mesh>
    <mesh position={[.43, 2.86, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[.065, .17, .88, 12, 1, true]} /><meshStandardMaterial color="#dc5538" side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[.015, 2.86, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[.17, .017, 6, 16]} /><meshStandardMaterial color="#f7ece4" />
    </mesh>
  </group>
}

export function Airfield({ field }: { field: Field }) {
  const asset = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`
  const maps = useLoader(THREE.TextureLoader, [asset('grass001-color.jpg'), asset('road001-color.jpg'), asset('road001-normalgl.jpg')])
  const sky = useLoader(RGBELoader, asset('farm-field-sky-1k.hdr'))
  const [grass, road, roadNormal] = useMemo(() => maps.map((map, i) => prepareTexture(map, i === 0 ? 250 : 1, i === 0 ? 250 : 12, i < 2)), [maps])
  const terrain = useMemo(() => terrainMesh(field), [field])
  useEffect(() => () => terrain.dispose(), [terrain])
  useEffect(() => () => { grass.dispose(); road.dispose(); roadNormal.dispose() }, [grass, road, roadNormal])
  sky.mapping = THREE.EquirectangularReflectionMapping
  const { runway } = field
  const markings = Math.floor((runway.length - 8) / 8)
  const water = Number.isFinite(field.waterLevel)
  const grassStrip = runway.surface === 'grass'
  return <>
    <primitive attach="background" object={sky} />
    <fog attach="fog" args={[palettes[field.biome].sky, 185, 710]} />
    <hemisphereLight args={['#ecf7ff', '#67735b', 1.65]} />
    <directionalLight position={[25, 35, -35]} intensity={2.35} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-75} shadow-camera-right={75} shadow-camera-top={75} shadow-camera-bottom={-75} shadow-bias={-.0001} />
    <mesh geometry={terrain} receiveShadow><meshStandardMaterial vertexColors map={field.biome === 'snow' ? null : grass} roughness={.99} /></mesh>
    {water && <mesh position={[0, field.waterLevel + .003, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1600, 1600]} /><meshStandardMaterial color="#4b8795" roughness={.24} metalness={.2} />
    </mesh>}
    <group position={[runway.center[0], runway.elevation, -runway.center[1]]} rotation={[0, THREE.MathUtils.degToRad(runway.heading), 0]}>
      {runway.surface === 'water' ? [-1, 1].flatMap(side => [-.43, -.22, 0, .22, .43].map(fraction =>
        <mesh key={`${side}:${fraction}`} position={[side * runway.width / 2, .12, fraction * runway.length]}>
          <sphereGeometry args={[.22, 12, 8]} /><meshStandardMaterial color={side > 0 ? '#e78248' : '#f6ebd9'} />
        </mesh>)) : <>
        <mesh position={[0, .013, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[runway.width, runway.length]} />
          <meshStandardMaterial map={grassStrip ? null : road} normalMap={grassStrip ? null : roadNormal}
            color={grassStrip ? '#6d8a4a' : runway.surface === 'concrete' ? '#c6bca7' : '#bcbcc0'} roughness={.88} />
        </mesh>
        {[-1, 1].map(side => <mesh key={side} position={[side * runway.width * .47, .025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[.08, runway.length - 2]} /><meshStandardMaterial color="#f1ecda" />
        </mesh>)}
        {Array.from({ length: markings }, (_, index) => <mesh key={index}
          position={[0, .028, (index - (markings - 1) / 2) * 8]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[.14, 3.2]} /><meshStandardMaterial color="#eee9d8" />
        </mesh>)}
        {[-1, 1].flatMap(end => [-.33, -.21, .21, .33].map(fraction => <mesh key={`${end}:${fraction}`}
          position={[fraction * runway.width, .026, end * (runway.length / 2 - 3)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[.29, 2.2]} /><meshStandardMaterial color="#f2edde" />
        </mesh>))}
      </>}
    </group>
    <Windsock field={field} />
    <FieldScenery field={field} />
  </>
}
