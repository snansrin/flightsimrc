import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import type { AircraftSpec } from '../sim/types'
import { hangarAircraft } from '../hangar'
import { FixedWing } from './FixedWing'

function Rotor({ position, radius, throttle, state, vertical = false, count = 2, direction = 1, ratio = 1 }: {
  position: [number, number, number]; radius: number; throttle: React.MutableRefObject<Controls>; state?: React.RefObject<FlightState>;
  vertical?: boolean; count?: number; direction?: number; ratio?: number;
}) {
  const spin = useRef<THREE.Group>(null)
  const width = Math.min(radius * .24, .034)
  useFrame((_, dt) => {
    const speed = state?.current.engineSpeed ?? throttle.current.throttle
    if (spin.current) spin.current.rotation.y += direction * dt * speed * 140 * ratio
  })
  return <group position={position} rotation={vertical ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
    <mesh castShadow><cylinderGeometry args={[width * .51, width * .65, width * .56, 20]} /><meshStandardMaterial color="#778890" metalness={.64} roughness={.33} /></mesh>
    <group ref={spin}>{Array.from({ length: count }, (_, index) => <group key={index} rotation={[0, index * Math.PI * 2 / count, 0]}>
      <mesh position={[.001, width * .27, radius * .52]} scale={[width * .5, .0038, radius * .47]} castShadow>
        <sphereGeometry args={[1, 18, 9]} /><meshStandardMaterial color={radius > .2 ? '#e4e8e5' : '#525f68'} metalness={.25} roughness={.42} />
      </mesh>
      <mesh position={[.001, width * .27, radius * .925]} scale={[width * .32, .0035, radius * .06]}>
        <sphereGeometry args={[1, 14, 8]} /><meshStandardMaterial color="#e4b578" roughness={.56} />
      </mesh>
    </group>)}</group>
  </group>
}

function Drone({ controls, spec, state }: { controls: React.MutableRefObject<Controls>; spec: AircraftSpec; state?: React.RefObject<FlightState> }) {
  const cinema = spec.id === 'cinedrone'
  const radius = cinema ? .086 : .061
  const arm = (spec.rotor?.armLength ?? .11) * Math.SQRT1_2
  const body = spec.visual.fuselageLength
  const width = spec.visual.fuselageRadius * 2
  const accent = spec.visual.accent
  return <group>
    <mesh castShadow><boxGeometry args={[width, .016, body]} /><meshStandardMaterial color="#273238" metalness={.38} roughness={.42} /></mesh>
    <mesh position={[0, .021, body * .025]} scale={[width * .55, .031, body * .47]} castShadow>
      <sphereGeometry args={[1, 30, 17]} /><meshPhysicalMaterial color={spec.visual.color} metalness={.3} roughness={.29} clearcoat={.26} />
    </mesh>
    <mesh position={[0, .052, -body * .12]} castShadow><boxGeometry args={[width * .71, .036, body * .48]} /><meshStandardMaterial color="#172128" metalness={.2} roughness={.64} /></mesh>
    <mesh position={[0, .073, -body * .12]}><boxGeometry args={[width * .83, .005, body * .105]} /><meshStandardMaterial color={accent} roughness={.78} /></mesh>
    {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => <group key={`${sx}:${sz}`}>
      <mesh position={[sx * arm * .56, .009, sz * arm * .56]} rotation={[0, sx * sz * Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[.023, .012, arm * 1.30]} /><meshStandardMaterial color="#333e43" metalness={.28} roughness={.49} />
      </mesh>
      <mesh position={[sx * arm, .021, sz * arm]}><cylinderGeometry args={[radius * .20, radius * .22, .025, 18]} />
        <meshStandardMaterial color={accent} metalness={.66} roughness={.34} />
      </mesh>
      <Rotor position={[sx * arm, .035, sz * arm]} radius={radius} throttle={controls} state={state} count={spec.visual.propBlades} direction={sx * sz} />
      {cinema && <mesh position={[sx * arm, .034, sz * arm]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 1.08, .0033, 8, 36]} /><meshStandardMaterial color="#4e5a63" roughness={.5} />
      </mesh>}
      <mesh position={[sx * arm, -.008, sz * arm]}><sphereGeometry args={[.006, 12, 8]} />
        <meshStandardMaterial color={sz > 0 ? '#ff654e' : '#62da9a'} emissive={sz > 0 ? '#ff3422' : '#37c984'} emissiveIntensity={1.3} />
      </mesh>
      <mesh position={[sx * arm * .73, -(cinema ? .054 : .025), sz * arm * .73]}>
        <cylinderGeometry args={[.006, .009, cinema ? .09 : .045, 10]} /><meshStandardMaterial color="#566068" roughness={.73} />
      </mesh>
    </group>)}
    <group position={[0, cinema ? -.049 : .007, body * .47]}>
      {cinema && <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[.037, .004, 10, 26]} /><meshStandardMaterial color="#9ba7a9" metalness={.38} roughness={.35} /></mesh>}
      <mesh scale={cinema ? [.044, .035, .031] : [.026, .024, .023]}><sphereGeometry args={[1, 22, 14]} /><meshPhysicalMaterial color="#121d24" metalness={.4} roughness={.29} clearcoat={.8} /></mesh>
      <mesh position={[0, 0, cinema ? .033 : .024]}><sphereGeometry args={[cinema ? .015 : .010, 22, 14]} /><meshPhysicalMaterial color="#255070" metalness={.34} roughness={.09} clearcoat={1} /></mesh>
    </group>
  </group>
}

function Helicopter({ controls, state }: { controls: React.MutableRefObject<Controls>; state?: React.RefObject<FlightState> }) {
  return <group>
    <mesh castShadow scale={[.14, .14, .31]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#e5e7e1" metalness={.15} roughness={.4} /></mesh>
    <mesh position={[0, .025, .1]} scale={[.11, .085, .13]}><sphereGeometry args={[1, 20, 12]} /><meshPhysicalMaterial color="#21475a" roughness={.07} metalness={.26} clearcoat={1} /></mesh>
    <mesh position={[0, -.025, .18]} scale={[.092, .02, .12]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#df6c42" metalness={.3} roughness={.38} /></mesh>
    <mesh position={[0, .03, -.18]}><boxGeometry args={[.14, .024, .065]} /><meshStandardMaterial color="#f0a04f" /></mesh>
    <mesh position={[0, .005, -.46]} castShadow><boxGeometry args={[.045, .055, .55]} /><meshStandardMaterial color="#d5ddd9" /></mesh>
    <mesh position={[0, .07, -.71]} castShadow><boxGeometry args={[.32, .012, .085]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <mesh position={[0, .13, -.71]}><boxGeometry args={[.012, .16, .1]} /><meshStandardMaterial color="#d44b35" /></mesh>
    <Rotor position={[0, .19, -.7]} radius={.075} vertical throttle={controls} state={state} ratio={3.5} />
    <mesh position={[0, .17, 0]}><cylinderGeometry args={[.013, .013, .13, 12]} /><meshStandardMaterial color="#747f82" metalness={.7} /></mesh>
    <Rotor position={[0, .26, 0]} radius={.55} throttle={controls} state={state} />
    {[-1, 1].map(side => <group key={side}><mesh position={[side * .11, -.17, 0]} castShadow><boxGeometry args={[.012, .014, .48]} /><meshStandardMaterial color="#38464b" /></mesh><mesh position={[side * .1, -.11, -.14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh><mesh position={[side * .1, -.11, .14]}><cylinderGeometry args={[.006, .006, .13, 8]} /><meshStandardMaterial color="#707b7d" /></mesh></group>)}
  </group>
}

export function VehicleModel({ kind, controls, state }: { kind: string; controls: React.MutableRefObject<Controls>; state?: React.RefObject<FlightState> }) {
  const spec = hangarAircraft(kind)
  if (spec.family === 'multirotor') return <Drone controls={controls} spec={spec} state={state} />
  if (spec.family === 'heli') return <Helicopter controls={controls} state={state} />
  return <FixedWing spec={spec} controls={controls} state={state} />
}
