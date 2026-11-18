import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'

export type AirfieldConfig = { name: string; subtitle: string; grass: string; sky: string; hills: string; wind: number; hangar: string; kind: 'plain' | 'coast' | 'alpine' | 'desert' | 'north' }
export const airfields: AirfieldConfig[] = [
  { name: 'Anadolu Eğitim Pisti', subtitle: 'Açık ova · sakin hava', grass: '#76916b', sky: '#accbe0', hills: '#6c846f', wind: 0, hangar: '#e8e4d8', kind: 'plain' },
  { name: 'Ege Kıyı Pisti', subtitle: 'Kıyı rüzgârı · yan rüzgâr', grass: '#a7a57c', sky: '#a6d0df', hills: '#8b987b', wind: 1.5, hangar: '#e8e1cd', kind: 'coast' },
  { name: 'Alp Vadisi', subtitle: 'Vadi · değişken hava', grass: '#71906e', sky: '#b1c9d7', hills: '#637477', wind: -2, hangar: '#dce2df', kind: 'alpine' },
  { name: 'Çöl Meydanı', subtitle: 'Kuru hava · sıcak zemin', grass: '#bb9d72', sky: '#c5d8dc', hills: '#b59670', wind: 2.5, hangar: '#ded2b8', kind: 'desert' },
  { name: 'Kuzey Yaylası', subtitle: 'Serin hava · hafif rüzgâr', grass: '#819386', sky: '#c5d6dc', hills: '#6b7e7e', wind: -1.2, hangar: '#e7e7e0', kind: 'north' },
]

function prepareTexture(texture: THREE.Texture, repeatX: number, repeatY: number, color = false) {
  const copy = texture.clone()
  copy.needsUpdate = true
  if (color) copy.colorSpace = THREE.SRGBColorSpace
  copy.anisotropy = 8
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping
  copy.repeat.set(repeatX, repeatY)
  return copy
}

function Hill({ position, scale, color }: { position: [number, number, number]; scale: [number, number, number]; color: string }) {
  return <mesh position={position} scale={scale}><sphereGeometry args={[1, 24, 10]} /><meshStandardMaterial color={color} roughness={1} /></mesh>
}

function Tree({ x, z, size }: { x: number; z: number; size: number }) {
  return <group position={[x, 0, z]}><mesh position={[0, size * .47, 0]} castShadow><cylinderGeometry args={[.025 * size, .045 * size, size * .75, 8]} /><meshStandardMaterial color="#665341" /></mesh><mesh position={[0, size * .93, 0]} scale={[.45 * size, .64 * size, .45 * size]} castShadow><sphereGeometry args={[1, 13, 9]} /><meshStandardMaterial color="#49684e" roughness={1} /></mesh><mesh position={[.12 * size, 1.1 * size, .05 * size]} scale={[.26 * size, .33 * size, .28 * size]}><sphereGeometry args={[1, 11, 7]} /><meshStandardMaterial color="#557654" roughness={1} /></mesh></group>
}

function Hangar({ color }: { color: string }) {
  return <group position={[-19, 0, 20]}>
    <mesh position={[0, 2.2, 0]} castShadow receiveShadow><boxGeometry args={[10, 4.4, 7]} /><meshStandardMaterial color={color} roughness={.85} /></mesh>
    <mesh position={[0, 4.58, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[5.4, 5.4, 7.2, 3]} /><meshStandardMaterial color="#56676a" roughness={.7} side={THREE.DoubleSide} /></mesh>
    <mesh position={[5.015, 2.0, 0]}><boxGeometry args={[.025, 3.4, 5.8]} /><meshStandardMaterial color="#43565d" metalness={.4} /></mesh>
    {[-2, 0, 2].map(z => <mesh key={z} position={[5.045, 2, z]}><boxGeometry args={[.03, 3.2, .025]} /><meshStandardMaterial color="#9eafb0" /></mesh>)}
    <mesh position={[1, .015, 5.7]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[15, 9]} /><meshStandardMaterial color="#b6b4a2" /></mesh>
  </group>
}

function Windsock() {
  return <group position={[8, 0, 14]}><mesh position={[0, 2.3, 0]} castShadow><cylinderGeometry args={[.025, .04, 4.6, 10]} /><meshStandardMaterial color="#cbd2d1" metalness={.6} /></mesh><mesh position={[.5, 4.45, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[.22, 1.1, 12, 1, true]} /><meshStandardMaterial color="#dc5538" side={THREE.DoubleSide} /></mesh><mesh position={[1.04, 4.45, 0]} rotation={[0, 0, -Math.PI / 2]}><torusGeometry args={[.13, .018, 6, 12]} /><meshStandardMaterial color="#f7ece4" /></mesh></group>
}

function TerrainLandmarks({ kind }: { kind: AirfieldConfig['kind'] }) {
  if (kind === 'coast') return <>
    <mesh position={[190, .015, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[280, 2000]} /><meshStandardMaterial color="#4d8296" metalness={.25} roughness={.38} /></mesh>
    <mesh position={[49, .02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[5, 2000]} /><meshStandardMaterial color="#d5c59b" roughness={1} /></mesh>
    {Array.from({ length: 18 }, (_, i) => <mesh key={i} position={[55 + (i % 3) * 4, .025, -210 + i * 25]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.5, 10]} /><meshBasicMaterial color="#d8e8e8" transparent opacity={.62} /></mesh>)}
  </>
  if (kind === 'alpine') return <>{[-1, 1].flatMap(side => Array.from({ length: 7 }, (_, i) => <group key={`${side}-${i}`} position={[side * (125 + i * 27), 4, -170 + i * 85]}><mesh castShadow><coneGeometry args={[60 + i * 8, 130 + i * 12, 5]} /><meshStandardMaterial color="#66787b" roughness={1} flatShading /></mesh><mesh position={[0, 44 + i * 4, 0]}><coneGeometry args={[19 + i * 3, 44, 5]} /><meshStandardMaterial color="#dce3df" flatShading /></mesh></group>))}</>
  if (kind === 'desert') return <>{Array.from({ length: 24 }, (_, i) => <mesh key={i} position={[(i % 2 ? -1 : 1) * (50 + i * 5), .3, -230 + i * 25]} scale={[25 + i % 4 * 6, 1.5 + i % 3, 13 + i % 5 * 3]}><sphereGeometry args={[1, 12, 6]} /><meshStandardMaterial color={i % 2 ? '#c5a479' : '#ddbb88'} roughness={1} flatShading /></mesh>)}</>
  if (kind === 'north') return <>{Array.from({ length: 18 }, (_, i) => <mesh key={i} position={[(i % 2 ? -1 : 1) * (65 + i * 9), .02, -220 + i * 30]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[7 + i % 4 * 2, 8]} /><meshStandardMaterial color="#d5dedb" roughness={1} /></mesh>)}</>
  return <>{Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[(i % 2 ? -1 : 1) * (65 + i * 12), .01, -210 + i * 35]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[25 + i % 4 * 5, 38]} /><meshStandardMaterial color={i % 2 ? '#8a9b66' : '#b1a87a'} roughness={1} /></mesh>)}</>
}

export function Airfield({ field }: { field: AirfieldConfig }) {
  const asset = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`
  const maps = useLoader(THREE.TextureLoader, [
    asset('grass001-color.jpg'), asset('grass001-normalgl.jpg'), asset('grass001-roughness.jpg'),
    asset('road001-color.jpg'), asset('road001-normalgl.jpg'), asset('road001-roughness.jpg'),
  ])
  const skyTexture = useLoader(RGBELoader, asset('farm-field-sky-1k.hdr'))
  const [grassColor, grassNormal, grassRough, roadColor, roadNormal, roadRough] = useMemo(() => maps.map((map, i) => prepareTexture(map, i < 3 ? 200 : 1, i < 3 ? 200 : 20, i === 0 || i === 3)), [maps])
  skyTexture.mapping = THREE.EquirectangularReflectionMapping
  const trees = useMemo(() => Array.from({ length: 75 }, (_, i) => {
    const a = i * 12.9898, x = Math.sin(a) * 48 + Math.cos(a * 2.3) * 23, z = Math.cos(a * .7) * 85
    return { x: x < 0 ? Math.min(x, -17) : Math.max(x, 17), z, size: 1.4 + (i % 5) * .25 }
  }), [])
  return <>
    <primitive attach="background" object={skyTexture} /><fog attach="fog" args={[field.sky, 160, 500]} />
    <hemisphereLight args={['#e7f4ff', '#57674d', 1.8]} />
    <directionalLight position={[25, 35, -35]} intensity={2.35} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-100} shadow-camera-right={100} shadow-camera-top={100} shadow-camera-bottom={-100} shadow-bias={-.0001} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[2000, 2000]} /><meshStandardMaterial map={grassColor} normalMap={grassNormal} roughnessMap={grassRough} color={field.grass} roughness={1} /></mesh>
    <mesh position={[0, .008, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[10, 190]} /><meshStandardMaterial map={roadColor} normalMap={roadNormal} roughnessMap={roadRough} color="#d3d3d0" roughness={.95} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * 5.05, .018, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.08, 185]} /><meshBasicMaterial color="#e5e1cd" /></mesh>
      {Array.from({ length: 13 }, (_, i) => <mesh key={i} position={[side * 4.2, .02, -80 + i * 13]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.65, 4]} /><meshBasicMaterial color="#e6e5da" /></mesh>)}
      {Array.from({ length: 18 }, (_, i) => <mesh key={i} position={[side * 14, .65, -90 + i * 11]}><boxGeometry args={[.04, 1.3, .04]} /><meshStandardMaterial color="#999c8c" /></mesh>)}
    </group>)}
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[0, .024, -77 + i * 14]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.16, 5]} /><meshBasicMaterial color="#f1eddd" /></mesh>)}
    {[-1, 1].flatMap(side => Array.from({ length: 4 }, (_, i) => <mesh key={`${side}-${i}`} position={[side * (1.2 + i * .7), .025, 78]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.42, 3.3]} /><meshBasicMaterial color="#f4eee0" /></mesh>))}
    <Hangar color={field.hangar} /><Windsock />
    <TerrainLandmarks kind={field.kind} />
    {trees.map((tree, i) => <Tree key={i} {...tree} />)}
    {Array.from({ length: 12 }, (_, i) => <Hill key={i} position={[(i - 6) * 95, -20, 360 + (i % 4) * 25]} scale={[83 + i % 5 * 8, 30 + i % 3 * 7, 60]} color={field.hills} />)}
  </>
}
