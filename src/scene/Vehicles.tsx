import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import { hangarAircraft } from '../hangar'
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
    <mesh position={[0, .038, .01]} castShadow><boxGeometry args={[.19, .025, .21]} /><meshStandardMaterial color="#b7c8cf" metalness={.5} roughness={.32} /></mesh>
    <mesh position={[0, .073, -.056]} castShadow><boxGeometry args={[.18, .056, .17]} /><meshStandardMaterial color="#15222c" metalness={.2} roughness={.42} /></mesh>
    <mesh position={[0, .107, -.055]}><boxGeometry args={[.12, .006, .1]} /><meshStandardMaterial color="#fa954a" emissive="#9b3a0d" emissiveIntensity={.22} /></mesh>
    <mesh position={[0, .051, .126]}><boxGeometry args={[.12, .012, .02]} /><meshStandardMaterial color="#ed704b" emissive="#a52f20" emissiveIntensity={.45} /></mesh>
    {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => <group key={`${sx}:${sz}`}>
      <mesh position={[sx * .22, .005, sz * .22]} rotation={[0, sx * sz * Math.PI / 4, 0]} castShadow><boxGeometry args={[.34, .025, .035]} /><meshStandardMaterial color="#333b3d" metalness={.25} /></mesh>
      <Rotor position={[sx * .32, .055, sz * .32]} radius={.13} throttle={controls} />
      <mesh position={[sx * .32, .035, sz * .32]}><torusGeometry args={[.15, .008, 8, 24]} /><meshStandardMaterial color={sz > 0 ? '#ed754f' : '#6bb7ca'} metalness={.45} roughness={.25} /></mesh>
      <mesh position={[sx * .32, .067, sz * .32 + .13]}><sphereGeometry args={[.018, 10, 8]} /><meshStandardMaterial color={sz > 0 ? '#ff654e' : '#62da9a'} emissive={sz > 0 ? '#ff3422' : '#37c984'} emissiveIntensity={1.9} /></mesh>
      <mesh position={[sx * .13, -.12, sz * .13]}><cylinderGeometry args={[.008, .008, .2, 8]} /><meshStandardMaterial color="#8d999a" /></mesh>
    </group>)}
    <mesh position={[0, -.045, .14]}><sphereGeometry args={[.038, 16, 12]} /><meshPhysicalMaterial color="#101a21" metalness={.3} roughness={.1} clearcoat={1} /></mesh>
    <mesh position={[0, -.045, .175]}><torusGeometry args={[.035, .006, 10, 24]} /><meshStandardMaterial color="#6c8996" metalness={.75} roughness={.24} /></mesh>
    <mesh position={[0, .10, -.15]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#657d81" metalness={.6} /></mesh>
    <mesh position={[0, .17, -.15]}><sphereGeometry args={[.018, 12, 8]} /><meshStandardMaterial color="#6ae7c5" emissive="#1bd7ac" emissiveIntensity={1.4} /></mesh>
  </group>
}

function Helicopter({ controls }: { controls: React.MutableRefObject<Controls> }) {
  return <group>
    <mesh castShadow scale={[.14, .14, .31]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#e5e7e1" metalness={.15} roughness={.4} /></mesh>
    <mesh position={[0, .025, .1]} scale={[.11, .085, .13]}><sphereGeometry args={[1, 20, 12]} /><meshPhysicalMaterial color="#21475a" roughness={.07} metalness={.26} clearcoat={1} /></mesh>
    <mesh position={[0, -.025, .18]} scale={[.092, .02, .12]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#df6c42" metalness={.3} roughness={.38} /></mesh>
    <mesh position={[0, .03, -.18]}><boxGeometry args={[.14, .024, .065]} /><meshStandardMaterial color="#f0a04f" /></mesh>
    <mesh position={[0, .005, -.46]} castShadow><boxGeometry args={[.045, .055, .55]} /><meshStandardMaterial color="#d5ddd9" /></mesh>
    <mesh position={[0, .07, -.71]} castShadow><boxGeometry args={[.32, .012, .085]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <mesh position={[0, .13, -.71]}><boxGeometry args={[.012, .16, .1]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <Rotor position={[0, .19, -.7]} radius={.075} vertical throttle={controls} />
    <mesh position={[0, .17, 0]}><cylinderGeometry args={[.013, .013, .13, 12]} /><meshStandardMaterial color="#747f82" metalness={.7} /></mesh>
    <Rotor position={[0, .26, 0]} radius={.55} throttle={controls} />
    {[-1, 1].map(side => <group key={side}><mesh position={[side * .11, -.17, 0]} castShadow><boxGeometry args={[.012, .014, .48]} /><meshStandardMaterial color="#38464b" /></mesh><mesh position={[side * .1, -.11, -.14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh><mesh position={[side * .1, -.11, .14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh></group>)}
  </group>
}

export function VehicleModel({ kind, controls, state }: { kind: string; controls: React.MutableRefObject<Controls>; state?: React.RefObject<FlightState> }) {
  if (kind === 'drone') return <Drone controls={controls} />
  if (kind === 'helicopter') return <Helicopter controls={controls} />
  if (kind === 'cinedrone') return <group scale={1.24}><Drone controls={controls} /></group>
  return <FixedWing spec={hangarAircraft(kind)} controls={controls} state={state} />
}
