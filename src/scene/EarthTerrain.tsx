import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FlightState } from '../flight'
import { coarseEdgeHeight, coarserNeighbor, terrainSubdivisions, terrainTiles, tileKey, type Tile, type WorldTerrain } from '../sim/worldTerrain'
import { WorldBuildings } from './WorldBuildings'
import { addGroundGrain } from './groundAppearance'
import { loadSurfaceMask, surfaceShader } from './terrainSurface'
import { sliceSceneWork } from './sceneWork'

type TileAsset = { tile: Tile; map: THREE.Texture | null }
type RenderTile = { asset: TileAsset; geometry: THREE.BufferGeometry; signature: string }
const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
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

function* terrainGeometry(world: WorldTerrain, tile: Tile, edgesAtLod: (Tile | undefined)[]) {
  const subdivisions = terrainSubdivisions(tile.z)
  const points: number[] = [], uv: number[] = [], index: number[] = []
  const n = 2 ** tile.z, stride = subdivisions + 1
  const [top, bottom, left, right] = edgesAtLod
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
    yield
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

function GroundTile({ world, renderTile, detailed, clock }: {
  world: WorldTerrain; renderTile: RenderTile; detailed: boolean; clock: { value: number };
}) {
  const { asset, geometry } = renderTile
  const [mask, setMask] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!detailed) { setMask(null); return }
    const request = new AbortController()
    let texture: THREE.Texture | null = null
    void loadSurfaceMask(asset.tile, world.scale, request.signal).then(result => {
      if (request.signal.aborted) result?.dispose()
      else { texture = result; setMask(result) }
    }).catch(() => { /* Satellite imagery still covers the tile. */ })
    return () => { request.abort(); texture?.dispose() }
  }, [asset.tile, detailed, world.scale])
  const appearance = useMemo(() => mask ? surfaceShader(mask, clock) : addGroundGrain, [mask, clock])
  return <mesh geometry={geometry}>
    <meshLambertMaterial key={mask ? 'surface' : 'imagery'} map={asset.map} color={asset.map ? '#eaf0e6' : '#6d776c'}
      emissiveMap={asset.map} emissive={asset.map ? '#ffffff' : '#000000'} emissiveIntensity={.28} side={THREE.DoubleSide}
      onBeforeCompile={appearance} />
  </mesh>
}

export function EarthTerrain({ world, flight, onImagery }: {
  world: WorldTerrain; flight: React.RefObject<FlightState>; onImagery: (state: 'loading' | 'ready' | 'unavailable') => void
}) {
  const [patch, setPatch] = useState(() => terrainTiles(world.origin.x, world.origin.y))
  const [tiles, setTiles] = useState<RenderTile[]>([])
  const detail = useMemo(() => tiles.map(entry => entry.asset).filter(asset => asset.tile.z === 14).slice(0, 9), [tiles])
  const detailedKeys = useMemo(() => new Set(detail.map(({ tile }) => tileKey(tile))), [detail])
  const surfaceTime = useMemo(() => ({ value: 0 }), [])
  const cache = useRef(new Map<string, TileAsset>())
  const readyMeshes = useRef(new Map<string, RenderTile>())
  const preloadedTextures = useRef(new WeakSet<THREE.Texture>())
  const published = useRef<RenderTile[]>([])
  const requests = useRef(new Map<string, Promise<TileAsset | null>>())
  const alive = useRef(true)
  const filled = useRef(false)
  const lastUpdate = useRef({ time: -Infinity, x: 0, z: 0 })
  const gl = useThree(state => state.gl)
  useFrame(({ clock }) => {
    const time = clock.elapsedTime, [x, , z] = flight.current.position
    surfaceTime.value = time
    const previous = lastUpdate.current
    if (time - previous.time < interval || Math.hypot(x - previous.x, z - previous.z) < 330) return
    lastUpdate.current = { time, x, z }
    const point = world.toMercator(x, -z)
    const next = terrainTiles(point.x, point.y)
    const keys = new Set(next.map(tileKey))
    setPatch(current => current.length === next.length && current.every(tile => keys.has(tileKey(tile))) ? current : next)
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      for (const tile of readyMeshes.current.values()) tile.geometry.dispose()
      readyMeshes.current.clear()
      for (const asset of cache.current.values()) asset.map?.dispose()
      cache.current.clear()
    }
  }, [])

  useEffect(() => {
    const requestScope = new AbortController()
    const { signal } = requestScope
    const required = new Set(patch.map(tileKey))
    const previousAssets = new Set(published.current.map(tile => tile.asset))
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
    const publish = async () => {
      const next = patch.flatMap(tile => {
        const asset = cache.current.get(tileKey(tile))
        return asset ? [asset] : []
      })
      const visible = new Set(next.map(({ tile }) => tileKey(tile)))
      const rendered: RenderTile[] = []
      for (const asset of next) {
        const borders = directions.map(([dx, dy]) => coarserNeighbor(asset.tile, dx, dy, visible))
        const borderState = borders.map(tile => tile ? tileKey(tile) + ':' + world.elevationNeighbors(tile) : '-').join('|')
        const signature = tileKey(asset.tile) + '/' + world.elevationNeighbors(asset.tile) + '/' + borderState
        let tile = readyMeshes.current.get(signature)
        if (!tile || tile.asset !== asset) {
          const geometry = await sliceSceneWork(terrainGeometry(world, asset.tile, borders), signal)
          if (signal.aborted) { geometry.dispose(); return }
          if (asset.map && !preloadedTextures.current.has(asset.map)) {
            try { gl.initTexture(asset.map) } catch { /* The material may upload it on first use. */ }
            preloadedTextures.current.add(asset.map)
          }
          tile = { asset, geometry, signature }
          readyMeshes.current.set(signature, tile)
        }
        rendered.push(tile)
      }
      if (signal.aborted || !rendered.length) return
      const previous = published.current
      if (rendered.length === previous.length && rendered.every((tile, index) => tile === previous[index])) return
      published.current = rendered
      setTiles(rendered)
      const keep = new Set(previous.concat(rendered).map(tile => tile.signature))
      for (const [key, tile] of readyMeshes.current) {
        if (readyMeshes.current.size <= 144) break
        if (!keep.has(key)) { tile.geometry.dispose(); readyMeshes.current.delete(key) }
      }
    }
    async function stream() {
      if (!filled.current) {
        const starter = await load(world.startTile)
        if (signal.aborted) return
        await publish()
        if (signal.aborted) return
        onImagery(starter?.map ? 'ready' : 'unavailable')
      }
      const missing = patch.filter(tile => !cache.current.has(tileKey(tile)))
      for (let i = 0; i < missing.length && !signal.aborted; i += 7) {
        await Promise.all(missing.slice(i, i + 7).map(load))
        if (!signal.aborted && !filled.current) await publish()
      }
      if (signal.aborted) return
      await publish()
      if (signal.aborted) return
      filled.current = true
      onImagery(patch.some(tile => cache.current.get(tileKey(tile))?.map) ? 'ready' : 'unavailable')
      const staleAssets = new Set<TileAsset>()
      for (const [key, asset] of cache.current) {
        if (cache.current.size <= 112) break
        if (required.has(key) || previousAssets.has(asset)) continue
        asset.map?.dispose()
        cache.current.delete(key)
        staleAssets.add(asset)
      }
      for (const [key, tile] of readyMeshes.current) {
        if (!staleAssets.has(tile.asset)) continue
        tile.geometry.dispose()
        readyMeshes.current.delete(key)
      }
    }
    void stream().catch(error => { if (!signal.aborted) console.warn('Terrain streaming:', error) })
    return () => requestScope.abort()
  }, [world, patch, onImagery, gl])

  return <>
    <color attach="background" args={['#a8c6dc']} />
    <fog attach="fog" args={['#a8c6dc', 10500, 46000]} />
    <EarthSky />
    <hemisphereLight args={['#eff8ff', '#8a9287', 2.05]} />
    <directionalLight position={[-24, 45, -30]} intensity={1.25} />
    {tiles.map(tile => <GroundTile key={tileKey(tile.asset.tile)} world={world} renderTile={tile}
      detailed={detailedKeys.has(tileKey(tile.asset.tile))} clock={surfaceTime} />)}
    {detail.slice(0, 4).map(({ tile }) =>
      <WorldBuildings key={tileKey(tile)} world={world} tile={tile} />)}
  </>
}
