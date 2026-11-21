import { useEffect, useState } from 'react'
import { classifyRings, type VectorTile } from '@mapbox/vector-tile'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Tile, WorldTerrain } from '../sim/worldTerrain'
import { addFacadeDetails, buildingMesh } from './buildingAppearance'
import { TerrainTrees, treesInTile } from './terrainVegetation'
import { loadSceneryTile } from './vectorScenery'
import { sliceSceneWork } from './sceneWork'

type BuildingGround = Pick<WorldTerrain, 'toLocal' | 'height'> & { noTrees?: (x: number, south: number) => boolean }

function* buildScenery(world: BuildingGround, tile: Tile, { layers }: VectorTile, bound: number) {
  const count = 2 ** tile.z
  const layer = layers.building
  const toLocal = (x: number, y: number, extent: number) => world.toLocal((tile.x + x / extent) / count, (tile.y + y / extent) / count)
  const trees = yield* treesInTile(layers.landcover, toLocal, world.height, bound, world.noTrees)
  const geometries: THREE.BufferGeometry[] = []
  try {
    for (let i = 0; layer && i < layer.length && geometries.length < 2100; i++) {
      if (i % 6 === 0) yield
      const feature = layer.feature(i)
      if (feature.type !== 3 || feature.properties.hide_3d === true) continue
      const extent = feature.extent
      const roofHeight = Math.min(600, Math.max(2, Number(feature.properties.render_height) || 5))
      const minHeight = Math.max(0, Math.min(Number(feature.properties.render_min_height) || 0, roofHeight - 1))
      for (const [outer, ...holes] of classifyRings(feature.loadGeometry())) {
        const middle = outer.reduce((sum, vertex) => sum.add(new THREE.Vector2(vertex.x, vertex.y)), new THREE.Vector2()).divideScalar(outer.length)
        // MVT tiles include a buffer around their edges. Draw the footprint in its owning tile only.
        if (middle.x < 0 || middle.y < 0 || middle.x >= extent || middle.y >= extent) continue
        const [x, south] = toLocal(middle.x, middle.y, extent)
        if (Math.abs(x) > bound || Math.abs(south) > bound) continue
        const shapeRing = (points: typeof outer) => points.map(point => {
          const [x, south] = toLocal(point.x, point.y, extent)
          return new THREE.Vector2(x, south)
        })
        const outline = shapeRing(outer)
        const grade = world.height(x, south)
        const foot = minHeight === 0 ? Math.min(15, outline.reduce((drop, point) =>
          Math.max(drop, grade - world.height(point.x, point.y) + 1.25), 1.25)) : 0
        const seed = Math.abs(Math.trunc(x * 39.17 + south * 21.97))
        const geometry = buildingMesh(outline, holes.map(shapeRing), grade + minHeight, foot, roofHeight - minHeight, seed, feature.properties.colour)
        if (geometry) geometries.push(geometry)
      }
    }
    const merged = geometries.length ? mergeGeometries(geometries) : null
    return { buildings: merged, trees }
  } finally {
    for (const geometry of geometries) geometry.dispose()
  }
}

async function loadBuildings(world: BuildingGround, tile: Tile, signal: AbortSignal, bound: number) {
  const vector = await loadSceneryTile(tile)
  return sliceSceneWork(buildScenery(world, tile, vector, bound), signal)
}

export function WorldBuildings({ world, tile, bound = Infinity }: { world: BuildingGround; tile: Tile; bound?: number }) {
  const [scenery, setScenery] = useState<Awaited<ReturnType<typeof loadBuildings>> | null>(null)
  useEffect(() => {
    const request = new AbortController()
    let current: THREE.BufferGeometry | null = null
    void loadBuildings(world, tile, request.signal, bound).then(result => {
      if (request.signal.aborted) result?.buildings?.dispose()
      else { current = result?.buildings ?? null; setScenery(result) }
    }).catch(() => { /* Terrain and flight continue independently of the vector service. */ })
    return () => { request.abort(); current?.dispose() }
  }, [world, tile, bound])
  if (!scenery) return null
  return <>
    {scenery.buildings && <mesh geometry={scenery.buildings} name="OpenStreetMap buildings">
      <meshStandardMaterial vertexColors roughness={.82} onBeforeCompile={addFacadeDetails} />
    </mesh>}
    {scenery.trees.length > 0 && <TerrainTrees key={scenery.trees.length} trees={scenery.trees} />}
  </>
}
