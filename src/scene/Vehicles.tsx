import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import { hangarAircraft } from '../hangar'
import { Trainer } from './Trainer'
import { FixedWing } from './FixedWing'

function Rotor({ position, radius, throttle, vertical = false }: { position: [number, number, number]; radius: number; throttle: React.MutableRefObject<Controls>; vertical?: boolean }) {
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * (15 + throttle.current.throttle * 100) })
  return <group position={position} rotation={vertical ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
    <mesh castShadow><cylinderGeometry args={[.035, .045, .045, 16]} /><meshStandardMaterial color="#2c3235" metalness={.4} /></mesh>
    <group ref={spin}>{[0, Math.PI].map(angle => <mesh key={angle} rotation={[0, angle, 0]} position={[Math.sin(angle) * radius * .48, .022, Math.cos(angle) * radius * .48]} castShadow><boxGeometry args={[.035, .006, radius * .96]} /><meshStandardMaterial color="#e2e5e2" metalness={.25} roughness={.42} /></mesh>)}</group>
  </group>
}

function Drone({ controls }: { controls: React.MutableRefObject<Controls> }) {
  return <group>
    <mesh castShadow><boxGeometry args={[.23, .065, .28]} /><meshStandardMaterial color="#313a3e" metalness={.35} roughness={.4} /></mesh>
    <mesh position={[0, .038, .01]} castShadow><boxGeometry args={[.19, .025, .21]} /><meshStandardMaterial color="#d5d8d2" /></mesh>
    {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => <group key={`${sx}:${sz}`}>
      <mesh position={[sx * .22, .005, sz * .22]} rotation={[0, sx * sz * Math.PI / 4, 0]} castShadow><boxGeometry args={[.34, .025, .035]} /><meshStandardMaterial color="#333b3d" metalness={.25} /></mesh>
      <Rotor position={[sx * .32, .055, sz * .32]} radius={.13} throttle={controls} />
      <mesh position={[sx * .32, .035, sz * .32]}><torusGeometry args={[.15, .008, 8, 24]} /><meshStandardMaterial color={sz > 0 ? '#d95537' : '#bac6c7'} /></mesh>
      <mesh position={[sx * .13, -.12, sz * .13]}><cylinderGeometry args={[.008, .008, .2, 8]} /><meshStandardMaterial color="#8d999a" /></mesh>
    </group>)}
    <mesh position={[0, -.045, .14]}><sphereGeometry args={[.038, 16, 12]} /><meshPhysicalMaterial color="#101a21" metalness={.3} roughness={.1} /></mesh>
  </group>
}

function Helicopter({ controls }: { controls: React.MutableRefObject<Controls> }) {
  return <group>
    <mesh castShadow scale={[.14, .14, .31]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#e5e7e1" metalness={.15} roughness={.4} /></mesh>
    <mesh position={[0, .025, .1]} scale={[.11, .085, .13]}><sphereGeometry args={[1, 20, 12]} /><meshPhysicalMaterial color="#213849" roughness={.1} metalness={.2} clearcoat={1} /></mesh>
    <mesh position={[0, .005, -.46]} castShadow><boxGeometry args={[.045, .055, .55]} /><meshStandardMaterial color="#d5ddd9" /></mesh>
    <mesh position={[0, .07, -.71]} castShadow><boxGeometry args={[.32, .012, .085]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <mesh position={[0, .13, -.71]}><boxGeometry args={[.012, .16, .1]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <Rotor position={[0, .19, -.7]} radius={.075} vertical throttle={controls} />
    <mesh position={[0, .17, 0]}><cylinderGeometry args={[.013, .013, .13, 12]} /><meshStandardMaterial color="#747f82" metalness={.7} /></mesh>
    <Rotor position={[0, .26, 0]} radius={.55} throttle={controls} />
    {[-1, 1].map(side => <group key={side}><mesh position={[side * .11, -.17, 0]} castShadow><boxGeometry args={[.012, .014, .48]} /><meshStandardMaterial color="#38464b" /></mesh><mesh position={[side * .1, -.11, -.14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh><mesh position={[side * .1, -.11, .14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh></group>)}
  </group>
}

function jetWing(side: number) {
  const outline = [[.08, .20], [.09, -.24], [.72, -.31], [.67, -.20]]
  const vertices: number[] = []
  for (const y of [-.012, .012]) for (const [x, z] of outline) vertices.push(side * x, y, z)
  const indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; indices.push(i, j, 4 + i, j, 4 + j, 4 + i) }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Jet() {
  return <group>
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.045, .085, .88, 24]} /><meshStandardMaterial color="#d9dedc" metalness={.3} roughness={.35} /></mesh>
    <mesh position={[0, .035, .15]} scale={[.075, .055, .2]}><sphereGeometry args={[1, 20, 12]} /><meshPhysicalMaterial color="#18364a" metalness={.25} roughness={.08} clearcoat={1} /></mesh>
    {[-1, 1].map(side => <group key={side} scale={[side, 1, 1]}>
      <mesh geometry={jetWing(-1)} castShadow><meshStandardMaterial color="#d9dedc" metalness={.2} roughness={.4} side={THREE.DoubleSide} /></mesh>
      <mesh position={[-.48, .005, -.07]} castShadow><boxGeometry args={[.3, .012, .12]} /><meshStandardMaterial color="#bd4939" /></mesh>
      <mesh position={[-.17, .015, -.35]}><boxGeometry args={[.25, .014, .13]} /><meshStandardMaterial color="#d9dedc" /></mesh>
      <mesh position={[-.16, .09, -.33]}><boxGeometry args={[.015, .16, .14]} /><meshStandardMaterial color="#d34f3b" /></mesh>
    </group>)}
    <mesh position={[0, 0, -.46]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.047, .047, .02, 24]} /><meshStandardMaterial color="#30393b" metalness={.55} /></mesh>
    {[-.2, .2].map(x => <mesh key={x} position={[x, -.16, .04]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.042, .042, .025, 16]} /><meshStandardMaterial color="#22282a" /></mesh>)}
    <mesh position={[0, -.15, .31]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.032, .032, .02, 16]} /><meshStandardMaterial color="#22282a" /></mesh>
  </group>
}

export function VehicleModel({ kind, controls, state }: { kind: string; controls: React.MutableRefObject<Controls>; state?: React.RefObject<FlightState> }) {
  if (kind === 'drone') return <Drone controls={controls} />
  if (kind === 'helicopter') return <Helicopter controls={controls} />
  if (kind === 'jet') return <Jet />
  if (kind === 'trainer') return <Trainer controls={controls} />
  if (kind === 'cinedrone') return <group scale={1.24}><Drone controls={controls} /></group>
  return <FixedWing spec={hangarAircraft(kind)} controls={controls} state={state} />
}
