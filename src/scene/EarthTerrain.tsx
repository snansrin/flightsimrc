import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FlightState } from '../flight'
import { satelliteUrl, terrainTiles, tileKey, type Tile, type WorldTerrain } from '../sim/worldTerrain'
import { WorldBuildings } from './WorldBuildings'

type TileAsset = { tile: Tile; map: THREE.Texture | null }
const interval = .55

function tileTexture(tile: Tile): Promise<THREE.Texture | null> {
  return new Promise(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => finish(null), 11000)
    function finish(map: THREE.Texture | null) {
      window.clearTimeout(timer)
      image.onload = image.onerror = null
      resolve(map)
    }
    image.onload = () => {
      const map = new THREE.Texture(image)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = 8
      map.needsUpdate = true
      finish(map)
    }
    image.onerror = () => finish(null)
    image.src = satelliteUrl(tile)
  })
}

function terrainGeometry(world: WorldTerrain, tile: Tile) {
  const subdivisions = tile.z === 14 ? 72 : tile.z === 13 ? 46 : 24
  const points: number[] = [], uv: number[] = [], index: number[] = []
  const n = 2 ** tile.z, stride = subdivisions + 1
  for (let row = 0; row <= subdivisions; row++) {
    for (let col = 0; col <= subdivisions; col++) {
      const u = col / subdivisions, v = row / subdivisions
      const [x, south] = world.toLocal((tile.x + u) / n, (tile.y + v) / n)
      points.push(x, world.height(x, south, tile.z), -south)
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
      points.push(points[vertex * 3], points[vertex * 3 + 1] - skirt, points[vertex * 3 + 2])
      uv.push(uv[vertex * 2], uv[vertex * 2 + 1])
      if (i) index.push(edge[i - 1], offset + i - 1, offset + i, edge[i - 1], offset + i, vertex)
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

function GroundTile({ world, asset, revision }: { world: WorldTerrain; asset: TileAsset; revision: number }) {
  const geometry = useMemo(() => terrainGeometry(world, asset.tile), [world, asset, revision])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}>
    <meshLambertMaterial map={asset.map} color={asset.map ? '#eaf0e6' : '#6d776c'} side={THREE.DoubleSide} />
  </mesh>
}

export function EarthTerrain({ world, flight, onImagery }: {
  world: WorldTerrain; flight: React.RefObject<FlightState>; onImagery: (state: 'loading' | 'ready' | 'unavailable') => void
}) {
  const [patch, setPatch] = useState(() => terrainTiles(world.origin.x, world.origin.y))
  const [assets, setAssets] = useState<TileAsset[]>([])
  const [revision, setRevision] = useState(0)
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
      const request = Promise.all([world.preload(tile).then(() => true, () => false), tileTexture(tile)])
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
      setAssets((previous) => next.length ? next : previous)
      setRevision(value => value + 1)
      if (next.some(asset => asset.map)) onImagery('ready')
    }
    async function stream() {
      if (!filled.current) publish()
      const missing = patch.filter(tile => !cache.current.has(tileKey(tile)))
      for (let i = 0; i < missing.length && active; i += 7) {
        await Promise.all(missing.slice(i, i + 7).map(load))
        if (active && !filled.current) publish()
      }
      if (!active) return
      publish()
      filled.current = true
      if (!patch.some(tile => cache.current.get(tileKey(tile))?.map)) onImagery('unavailable')
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
    {assets.map(asset => <GroundTile key={tileKey(asset.tile)} world={world} asset={asset} revision={revision} />)}
    {assets.filter(asset => asset.tile.z === 14).slice(0, 4).map(({ tile }) =>
      <WorldBuildings key={tileKey(tile)} world={world} tile={tile} />)}
  </>
}
