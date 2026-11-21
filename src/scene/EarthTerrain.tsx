import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FlightState } from '../flight'
import { coarseEdgeHeight, coarserNeighbor, terrainSubdivisions, terrainTiles, tileKey, type Tile, type WorldTerrain } from '../sim/worldTerrain'
import { WorldBuildings } from './WorldBuildings'
import { addGroundGrain } from './groundAppearance'

type TileAsset = { tile: Tile; map: THREE.Texture | null }
const interval = .55

async function tileTexture(world: WorldTerrain, tile: Tile) {
  const image = await world.satellite(tile)
  if (!image) return null
  const map = new THREE.Texture(image)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.needsUpdate = true
  return map
}

function terrainGeometry(world: WorldTerrain, tile: Tile, visible: ReadonlySet<string>) {
  const subdivisions = terrainSubdivisions(tile.z)
  const points: number[] = [], uv: number[] = [], index: number[] = []
  const n = 2 ** tile.z, stride = subdivisions + 1
  const top = coarserNeighbor(tile, 0, -1, visible), bottom = coarserNeighbor(tile, 0, 1, visible)
  const left = coarserNeighbor(tile, -1, 0, visible), right = coarserNeighbor(tile, 1, 0, visible)
  for (let row = 0; row <= subdivisions; row++) {
    for (let col = 0; col <= subdivisions; col++) {
      const u = col / subdivisions, v = row / subdivisions
      const mx = (tile.x + u) / n, my = (tile.y + v) / n
      const [x, south] = world.toLocal(mx, my)
      const horizontal = row === 0 ? top : row === subdivisions ? bottom : undefined
      const vertical = col === 0 ? left : col === subdivisions ? right : undefined
      let height = world.heightAtMercator(mx, my, tile.z)
      if (horizontal && (!vertical || horizontal.z <= vertical.z)) height = coarseEdgeHeight(horizontal, true, mx, my, world.heightAtMercator)
      else if (vertical) height = coarseEdgeHeight(vertical, false, mx, my, world.heightAtMercator)
      points.push(x, height, -south)
      uv.push(u, 1 - v)
      if (!row || !col) continue
      const p = row * stride + col
      index.push(p - stride - 1, p - stride, p, p - stride - 1, p, p - 1)
    }
  }

  // Skirts seal the edge where adjacent elevation levels use different sample spacing.
  const skirt = Math.max(14, world.scale / n * .008)
  const edges = [
    Array.from({ length: stride }, (_, i) => i),
    Array.from({ length: stride }, (_, i) => i * stride + subdivisions),
    Array.from({ length: stride }, (_, i) => stride ** 2 - 1 - i),
    Array.from({ length: stride }, (_, i) => (subdivisions - i) * stride),
  ]
  for (const edge of edges) {
    const offset = points.length / 3
    edge.forEach((vertex, i) => {
      const [x, y, z] = [points[vertex * 3], points[vertex * 3 + 1], points[vertex * 3 + 2]]
      const u = uv[vertex * 2], v = uv[vertex * 2 + 1]
      // Split skirt vertices so the vertical skirt does not tilt the normals on the ground.
      points.push(x, y, z, x, y - skirt, z)
      uv.push(u, v, u, v)
      const at = offset + 2 * i
      if (i) index.push(at - 2, at - 1, at + 1, at - 2, at + 1, at)
    })
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

const skyVertex = `
  varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const skyFragment = `
  varying vec3 direction;
  void main() {
    vec3 ray = normalize(direction);
    float altitude = max(0.0, ray.y);
    vec3 haze = vec3(0.392, 0.565, 0.693);
    vec3 zenith = vec3(0.071, 0.259, 0.540);
    vec3 sky = mix(haze, zenith, pow(altitude, 0.45));
    float sunlight = max(0.0, dot(ray, normalize(vec3(-0.42, 0.72, -0.39))));
    sky += vec3(0.30, 0.21, 0.11) * pow(sunlight, 38.0) + vec3(1.0, 0.83, 0.57) * pow(sunlight, 550.0);
    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`

function EarthSky() {
  const dome = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => { dome.current?.position.copy(camera.position) })
  return <mesh ref={dome} frustumCulled={false} renderOrder={-10}>
    <sphereGeometry args={[52000, 28, 16]} />
    <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} />
  </mesh>
}

function GroundTile({ world, asset, visible }: { world: WorldTerrain; asset: TileAsset; visible: ReadonlySet<string> }) {
  const geometry = useMemo(() => terrainGeometry(world, asset.tile, visible), [world, asset, visible])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}>
    <meshLambertMaterial map={asset.map} color={asset.map ? '#eaf0e6' : '#6d776c'}
      emissiveMap={asset.map} emissive={asset.map ? '#ffffff' : '#000000'} emissiveIntensity={.28} side={THREE.DoubleSide}
      onBeforeCompile={addGroundGrain} />
  </mesh>
}

export function EarthTerrain({ world, flight, onImagery }: {
  world: WorldTerrain; flight: React.RefObject<FlightState>; onImagery: (state: 'loading' | 'ready' | 'unavailable') => void
}) {
  const [patch, setPatch] = useState(() => terrainTiles(world.origin.x, world.origin.y))
  const [assets, setAssets] = useState<TileAsset[]>([])
  const visible = useMemo(() => new Set(assets.map(({ tile }) => tileKey(tile))), [assets])
  const cache = useRef(new Map<string, TileAsset>())
  const requests = useRef(new Map<string, Promise<TileAsset | null>>())
  const alive = useRef(true)
  const filled = useRef(false)
  const lastUpdate = useRef({ time: -Infinity, x: 0, z: 0 })
  useFrame(({ clock }) => {
    const time = clock.elapsedTime, [x, , z] = flight.current.position
    const previous = lastUpdate.current
    if (time - previous.time < interval || Math.hypot(x - previous.x, z - previous.z) < 330) return
    lastUpdate.current = { time, x, z }
    const point = world.toMercator(x, -z)
    const next = terrainTiles(point.x, point.y)
    setPatch(current => current.length === next.length && current.every((tile, index) => tileKey(tile) === tileKey(next[index]))
      ? current : next)
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      for (const asset of cache.current.values()) asset.map?.dispose()
      cache.current.clear()
    }
  }, [])

  useEffect(() => {
    let active = true
    const required = new Set(patch.map(tileKey))
    const load = (tile: Tile) => {
      const key = tileKey(tile)
      const ready = cache.current.get(key)
      if (ready) return Promise.resolve(ready)
      const pending = requests.current.get(key)
      if (pending) return pending
      const request = Promise.all([world.preload(tile).then(() => true, () => false), tileTexture(world, tile)])
        .then(([hasElevation, map]) => {
          if (!alive.current || !hasElevation) { map?.dispose(); return null }
          const asset = { tile, map }
          cache.current.set(key, asset)
          return asset
        }).finally(() => requests.current.delete(key))
      requests.current.set(key, request)
      return request
    }
    const publish = () => {
      const next = patch.flatMap(tile => {
        const asset = cache.current.get(tileKey(tile))
        return asset ? [asset] : []
      })
      setAssets(previous => !next.length || (next.length === previous.length && next.every((asset, index) => asset === previous[index]))
        ? previous : next)
    }
    async function stream() {
      if (!filled.current) {
        const starter = await load(world.startTile)
        if (!active) return
        publish()
        onImagery(starter?.map ? 'ready' : 'unavailable')
      }
      const missing = patch.filter(tile => !cache.current.has(tileKey(tile)))
      for (let i = 0; i < missing.length && active; i += 7) {
        await Promise.all(missing.slice(i, i + 7).map(load))
        if (active && !filled.current) publish()
      }
      if (!active) return
      publish()
      filled.current = true
      onImagery(patch.some(tile => cache.current.get(tileKey(tile))?.map) ? 'ready' : 'unavailable')
      for (const [key, asset] of cache.current) {
        if (cache.current.size <= 112) break
        if (required.has(key)) continue
        asset.map?.dispose()
        cache.current.delete(key)
      }
    }
    void stream()
    return () => { active = false }
  }, [world, patch, onImagery])

  return <>
    <color attach="background" args={['#a8c6dc']} />
    <fog attach="fog" args={['#a8c6dc', 10500, 46000]} />
    <EarthSky />
    <hemisphereLight args={['#eff8ff', '#8a9287', 2.05]} />
    <directionalLight position={[-24, 45, -30]} intensity={1.25} />
    {assets.map(asset => <GroundTile key={tileKey(asset.tile)} world={world} asset={asset} visible={visible} />)}
    {assets.filter(asset => asset.tile.z === 14).slice(0, 4).map(({ tile }) =>
      <WorldBuildings key={tileKey(tile)} world={world} tile={tile} />)}
  </>
}
