import * as THREE from 'three'
import type { VectorTile, VectorTileLayer } from '@mapbox/vector-tile'
import type { Tile } from '../sim/worldTerrain'
import { addGroundGrain } from './groundAppearance'
import { loadSceneryTile } from './vectorScenery'
import { sliceSceneWork } from './sceneWork'

const resolution = 512
const roads: Record<string, number> = { motorway: 15, trunk: 12, primary: 10, secondary: 8, tertiary: 6, minor: 4.5 }

function* drawSurface({ layers }: VectorTile, width: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = resolution
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const context = ctx
  context.fillStyle = '#000000'
  context.fillRect(0, 0, resolution, resolution)
  let drawn = false
  function* trace(layer: VectorTileLayer | undefined, type: 2 | 3, color: string) {
    if (!layer) return
    for (let i = 0; i < layer.length; i++) {
      if (i % 12 === 0) yield
      const feature = layer.feature(i)
      const road = roads[String(feature.properties.class)]
      if (feature.type !== type || (type === 2 && (!road || feature.properties.brunnel))) continue
      const scale = resolution / feature.extent
      context.beginPath()
      for (const path of feature.loadGeometry()) {
        if (!path.length) continue
        context.moveTo(path[0].x * scale, path[0].y * scale)
        for (let j = 1; j < path.length; j++) context.lineTo(path[j].x * scale, path[j].y * scale)
        if (type === 3) context.closePath()
      }
      if (type === 3) {
        context.fillStyle = color
        context.fill('evenodd')
      } else {
        context.strokeStyle = color
        context.lineWidth = Math.max(.8, road * resolution / width)
        context.lineJoin = 'round'
        context.stroke()
      }
      drawn = true
    }
  }
  yield* trace(layers.water, 3, '#ff0000')
  yield* trace(layers.transportation, 2, '#00ff00')
  if (!drawn) return null
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 4
  return texture
}

export async function loadSurfaceMask(tile: Tile, meters: number, signal: AbortSignal) {
  const source = await loadSceneryTile(tile)
  return sliceSceneWork(drawSurface(source, meters / 2 ** tile.z), signal)
}

export function surfaceShader(mask: THREE.Texture, clock: { value: number }): THREE.MeshLambertMaterial['onBeforeCompile'] {
  return shader => {
    addGroundGrain(shader)
    shader.uniforms.terrainMask = { value: mask }
    shader.uniforms.surfaceTime = clock
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLayerUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLayerUv = uv;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vLayerUv;
      uniform sampler2D terrainMask;
      uniform float surfaceTime;
    `).replace('#include <opaque_fragment>', `
      vec2 surface = texture2D(terrainMask, vLayerUv).rg;
      float dist = length(vGroundView);
      float road = surface.g * (1.0 - surface.r) * (1.0 - smoothstep(260.0, 2300.0, dist));
      outgoingLight = mix(outgoingLight, mix(outgoingLight*.71, vec3(.17,.174,.165), .36), road*.66);
      if (surface.r > .015) {
        vec3 upView = normalize(cameraPosition - vec3(vGroundMeters.x, 0.0, vGroundMeters.y));
        float reflectivity = pow(1.0 - clamp(upView.y, 0.0, 1.0), 3.1);
        vec2 wave = vGroundMeters;
        float eddy = sin(dot(wave,vec2(.011,.018)) + surfaceTime*.42)
          + .57*sin(dot(wave,vec2(-.019,.007)) - surfaceTime*.23);
        float swell = dot(wave,vec2(.242,.108)) - surfaceTime*1.34 + 2.2*eddy;
        float ripple = dot(wave,vec2(-.124,.399)) + surfaceTime*1.79 - 1.35*eddy;
        float waveFade = (1.0 - smoothstep(330.0,2100.0,dist)) *
          (1.0 - smoothstep(.29,1.08,max(fwidth(swell),fwidth(ripple))));
        vec3 waterNormal = normalize(vec3((.036*cos(swell)-.018*cos(ripple))*waveFade, 1.0,
          (.02*cos(swell)+.034*cos(ripple))*waveFade));
        vec3 lightDirection = normalize(vec3(-.42,.72,-.39));
        float glint = pow(max(0.0,dot(reflect(-upView,waterNormal),lightDirection)),38.0);
        vec3 water = mix(outgoingLight*.94, vec3(.12,.24,.32), .075 + reflectivity*.27);
        water *= 1.0 + (.047*sin(swell) + .022*sin(ripple))*waveFade;
        water += vec3(.13,.118,.091)*glint;
        outgoingLight = mix(outgoingLight,water,surface.r * .79 * (1.0 - smoothstep(1850.0,3800.0,dist)));
      }
      #include <opaque_fragment>
    `)
  }
}
