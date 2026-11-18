import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls } from '../flight'

// Original, code-built 1.5 m class high-wing trainer. No third-party model assets.
function fuselageGeometry() {
  const rings = [
    [-0.59, 0.018, 0.018], [-0.45, 0.038, 0.042], [-0.27, 0.073, 0.080],
    [0.02, 0.094, 0.102], [0.25, 0.082, 0.087], [0.43, 0.057, 0.061], [0.53, 0.027, 0.029],
  ]
  const vertices: number[] = [], indices: number[] = []
  const sides = 12
  rings.forEach(([z, rx, ry]) => {
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2
      vertices.push(Math.cos(a) * rx, Math.sin(a) * ry, z)
    }
  })
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = (i + 1) * sides + j, d = (i + 1) * sides + (j + 1) % sides
    indices.push(a, c, b, b, c, d)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function wingGeometry(side: number, length: number, rootChord: number, tipChord: number) {
  const root = 0.055, tip = length, y0 = 0.105, y1 = 0.145
  const points = [
    [side * root, y0, -rootChord * .46], [side * root, y0, rootChord * .54],
    [side * tip, y1, -tipChord * .48], [side * tip, y1, tipChord * .52],
    [side * root, y0 - .018, -rootChord * .46], [side * root, y0 - .018, rootChord * .54],
    [side * tip, y1 - .012, -tipChord * .48], [side * tip, y1 - .012, tipChord * .52],
  ]
  const faces = [[0, 1, 2], [1, 3, 2], [6, 5, 4], [6, 7, 5], [0, 2, 4], [2, 6, 4], [1, 5, 3], [3, 5, 7], [2, 3, 6], [3, 7, 6]]
  const vertices = faces.flatMap(face => face.flatMap(index => points[index]))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function Rod({ from, to, radius = .008, color = '#c8cbd0' }: { from: [number, number, number]; to: [number, number, number]; radius?: number; color?: string }) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to)
  const mid = start.clone().add(end).multiplyScalar(.5)
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())
  return <mesh position={mid} quaternion={orientation} castShadow><cylinderGeometry args={[radius, radius, start.distanceTo(end), 8]} /><meshStandardMaterial color={color} metalness={.55} roughness={.42} /></mesh>
}

function Wheel({ position }: { position: [number, number, number] }) {
  return <group position={position}><mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.045, .045, .024, 18]} /><meshStandardMaterial color="#1b2023" roughness={.9} /></mesh><mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.019, .019, .027, 16]} /><meshStandardMaterial color="#aeb9bd" metalness={.6} roughness={.4} /></mesh></group>
}

export function Trainer({ controls }: { controls: React.MutableRefObject<Controls> }) {
  const propeller = useRef<THREE.Group>(null)
  const leftAileron = useRef<THREE.Mesh>(null)
  const rightAileron = useRef<THREE.Mesh>(null)
  const elevator = useRef<THREE.Mesh>(null)
  const rudder = useRef<THREE.Mesh>(null)
  const body = useMemo(fuselageGeometry, [])
  const leftWing = useMemo(() => wingGeometry(-1, .75, .28, .18), [])
  const rightWing = useMemo(() => wingGeometry(1, .75, .28, .18), [])
  const tailLeft = useMemo(() => wingGeometry(-1, .28, .12, .08), [])
  const tailRight = useMemo(() => wingGeometry(1, .28, .12, .08), [])
  useFrame((_, dt) => {
    if (propeller.current) propeller.current.rotation.z += dt * (8 + controls.current.throttle * 85)
    if (leftAileron.current) leftAileron.current.rotation.x = controls.current.aileron * .22
    if (rightAileron.current) rightAileron.current.rotation.x = -controls.current.aileron * .22
    if (elevator.current) elevator.current.rotation.x = controls.current.elevator * .22
    if (rudder.current) rudder.current.rotation.y = controls.current.rudder * .25
  })
  return <group>
    <mesh geometry={body} castShadow><meshStandardMaterial color="#f6f4e9" metalness={.06} roughness={.52} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={leftWing} castShadow><meshStandardMaterial color="#f8f7f0" side={THREE.DoubleSide} roughness={.5} /></mesh>
    <mesh geometry={rightWing} castShadow><meshStandardMaterial color="#f8f7f0" side={THREE.DoubleSide} roughness={.5} /></mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * .44, .148, .03]} rotation={[0, 0, side * .055]} castShadow><boxGeometry args={[.53, .003, .055]} /><meshStandardMaterial color="#d44532" /></mesh>
      <mesh position={[side * .73, .13, -.01]} castShadow><boxGeometry args={[.025, .018, .17]} /><meshStandardMaterial color="#d44532" /></mesh>
      <mesh ref={side < 0 ? leftAileron : rightAileron} position={[side * .60, .126, -.097]} castShadow><boxGeometry args={[.24, .013, .048]} /><meshStandardMaterial color="#eef1ed" /></mesh>
      <Rod from={[side * .17, -.065, .04]} to={[side * .49, .12, .02]} radius={.006} />
    </group>)}
    <mesh position={[0, .094, .12]} scale={[.088, .05, .19]} castShadow><sphereGeometry args={[1, 18, 10]} /><meshPhysicalMaterial color="#243a47" metalness={.15} roughness={.12} transparent opacity={.88} clearcoat={1} /></mesh>
    <mesh position={[0, -.014, .34]}><boxGeometry args={[.17, .035, .07]} /><meshStandardMaterial color="#d54b36" /></mesh>
    <mesh position={[0, 0, .525]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.034, .043, .04, 16]} /><meshStandardMaterial color="#2d3539" metalness={.5} /></mesh>
    <group ref={propeller} position={[0, 0, .555]}><mesh castShadow><boxGeometry args={[.018, .37, .012]} /><meshStandardMaterial color="#20282d" /></mesh><mesh><sphereGeometry args={[.023, 12, 8]} /><meshStandardMaterial color="#d9dfe0" metalness={.7} /></mesh></group>
    <group position={[0, -.035, -.48]}>
      <mesh geometry={tailLeft} castShadow><meshStandardMaterial color="#f6f3e8" side={THREE.DoubleSide} /></mesh>
      <mesh geometry={tailRight} castShadow><meshStandardMaterial color="#f6f3e8" side={THREE.DoubleSide} /></mesh>
      <mesh ref={elevator} position={[0, .08, -.077]}><boxGeometry args={[.51, .012, .045]} /><meshStandardMaterial color="#d74b39" /></mesh>
      <mesh position={[0, .145, -.04]} castShadow><boxGeometry args={[.018, .28, .18]} /><meshStandardMaterial color="#f6f3e8" /></mesh>
      <mesh ref={rudder} position={[0, .15, -.15]}><boxGeometry args={[.019, .23, .048]} /><meshStandardMaterial color="#d74b39" /></mesh>
    </group>
    <Rod from={[-.07, -.06, .06]} to={[-.18, -.17, .16]} radius={.007} color="#707d82" />
    <Rod from={[.07, -.06, .06]} to={[.18, -.17, .16]} radius={.007} color="#707d82" />
    <Wheel position={[-.18, -.18, .16]} /><Wheel position={[.18, -.18, .16]} />
    <Rod from={[0, -.035, -.44]} to={[0, -.15, -.49]} radius={.006} color="#707d82" />
    <Wheel position={[0, -.16, -.49]} />
    <mesh position={[0, .075, .01]}><boxGeometry args={[.065, .006, .15]} /><meshStandardMaterial color="#d54b36" /></mesh>
  </group>
}
