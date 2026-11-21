import { useEffect, useState } from 'react'
import { classifyRings, VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Tile, WorldTerrain } from '../sim/worldTerrain'

let tileTemplate: Promise<string> | undefined
type BuildingGround = Pick<WorldTerrain, 'toLocal' | 'height'>
function buildingSource() {
  tileTemplate ??= fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(8000) })
    .then(async response => {
      if (!response.ok) throw new Error('Building service unavailable')
      const { tiles } = await response.json() as { tiles: string[] }
      if (!tiles?.[0]?.startsWith('https://tiles.openfreemap.org/')) throw new Error('Invalid building tile source')
      return tiles[0]
    }).catch(error => { tileTemplate = undefined; throw error })
  return tileTemplate
}

async function loadBuildings(world: BuildingGround, tile: Tile, signal: AbortSignal, bound: number) {
  const count = 2 ** tile.z
  const column = ((tile.x % count) + count) % count
  const source = await buildingSource()
  const url = source.replace('{z}', String(tile.z)).replace('{x}', String(column)).replace('{y}', String(tile.y))
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) })
  if (!response.ok) return null
  const layer = new VectorTile(new PbfReader(await response.arrayBuffer())).layers.building
  if (!layer) return null
  const geometries: THREE.BufferGeometry[] = []
  const color = new THREE.Color()
  for (let i = 0; i < layer.length && geometries.length < 2100; i++) {
    const feature = layer.feature(i)
    if (feature.type !== 3 || feature.properties.hide_3d === true) continue
    const extent = feature.extent
    const roofHeight = Math.min(600, Math.max(2, Number(feature.properties.render_height) || 5))
    const minHeight = Math.max(0, Math.min(Number(feature.properties.render_min_height) || 0, roofHeight - 1))
    for (const [outer, ...holes] of classifyRings(feature.loadGeometry())) {
      const middle = outer.reduce((sum, vertex) => sum.add(new THREE.Vector2(vertex.x, vertex.y)), new THREE.Vector2()).divideScalar(outer.length)
      // MVT tiles include a buffer around their edges. Draw the footprint in its owning tile only.
      if (middle.x < 0 || middle.y < 0 || middle.x >= extent || middle.y >= extent) continue
      const [x, south] = world.toLocal((tile.x + middle.x / extent) / count, (tile.y + middle.y / extent) / count)
      if (Math.abs(x) > bound || Math.abs(south) > bound) continue
      const shapeRing = (points: typeof outer) => points.map(point => {
        const [x, south] = world.toLocal((tile.x + point.x / extent) / count, (tile.y + point.y / extent) / count)
        return new THREE.Vector2(x, south)
      })
      const outline = shapeRing(outer)
      if (Math.abs(THREE.ShapeUtils.area(outline)) < 12) continue
      const shape = new THREE.Shape(outline)
      shape.holes = holes.map(hole => new THREE.Path(shapeRing(hole)))
      const level = world.height(x, south) + minHeight
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: roofHeight - minHeight + (minHeight === 0 ? 2 : 0), bevelEnabled: false })
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, level - (minHeight === 0 ? 2 : 0), 0)
      const normals = geometry.getAttribute('normal')
      const colors = new Float32Array(normals.count * 3)
      for (let idx = 0; idx < normals.count; idx++) color.set(normals.getY(idx) > .8 ? '#777c78' : '#b6b5a7').toArray(colors, idx * 3)
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geometries.push(geometry)
    }
  }
  if (!geometries.length) return null
  const merged = mergeGeometries(geometries)
  for (const geometry of geometries) geometry.dispose()
  return merged
}

export function WorldBuildings({ world, tile, bound = Infinity }: { world: BuildingGround; tile: Tile; bound?: number }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    const request = new AbortController()
    let current: THREE.BufferGeometry | null = null
    void loadBuildings(world, tile, request.signal, bound).then(result => {
      if (request.signal.aborted) result?.dispose()
      else { current = result; setGeometry(result) }
    }).catch(() => { /* Terrain and flight continue independently of the vector service. */ })
    return () => { request.abort(); current?.dispose() }
  }, [world, tile, bound])
  if (!geometry) return null
  return <mesh geometry={geometry} name="OpenStreetMap buildings">
    <meshStandardMaterial vertexColors roughness={.92} />
  </mesh>
}
