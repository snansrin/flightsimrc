import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import type { AircraftSpec } from '../sim/types'

import { cabinGeometry, empennageGeometry, fuselageGeometry, wingPieces } from './aircraftGeometry'

export function FixedWing({ spec, controls, state }: { spec: AircraftSpec; controls: React.RefObject<Controls>; state?: React.RefObject<FlightState> }) {
  const { visual, prop } = spec
  const spinner = useRef<THREE.Group>(null)
  const blur = useRef<THREE.MeshBasicMaterial>(null)
  const blades = useRef<THREE.Group>(null)
  const surfaces = useRef<(THREE.Group | null)[]>([])
  const flaps = useRef<(THREE.Group | null)[]>([])
  const tailControls = useRef(new Map<string, THREE.Group>())
  const wheels = useRef(new Map<string, THREE.Group>())
  const tails = useMemo(() => spec.surfaces.filter(surface => surface.kind === 'htail' || surface.kind === 'vtail'), [spec])
  const retractable = useMemo(() => spec.gear.filter(gear => gear.kind === 'wheel' && gear.retractChannel >= 0), [spec])
  const tailMeshes = useMemo(() => tails.map(surface => {
    const chord = surface.area / surface.span
    const vertical = surface.kind === 'vtail'
    return { surface, chord, vertical, fixed: empennageGeometry(surface.span, chord, vertical, false),
      moving: empennageGeometry(surface.span, chord, vertical, true) }
  }), [tails])
  useEffect(() => () => {
    tailMeshes.forEach(tail => { tail.fixed.dispose(); tail.moving.dispose() })
  }, [tailMeshes])
  const wing = useMemo(() => wingPieces(spec), [spec])
  const fuselage = useMemo(() => fuselageGeometry(spec), [spec])
  const canopy = useMemo(() => cabinGeometry(spec), [spec])
  const blade = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-.015, .018)
    shape.quadraticCurveTo(-.022, .13, .015, .48)
    shape.quadraticCurveTo(.026, .52, .041, .48)
    shape.quadraticCurveTo(.023, .27, .027, .018)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: .009, bevelEnabled: true, bevelSize: .003, bevelThickness: .002, bevelSegments: 2 })
  }, [])
  useEffect(() => {
    wing.forEach(piece => piece.geometry.dispose())
    fuselage.dispose()
    canopy.dispose()
  }, [wing, fuselage, canopy])
  useEffect(() => () => blade.dispose(), [blade])
  useFrame((_, delta) => {
    const rpm = state?.current.engineSpeed ?? controls.current.throttle
    if (spinner.current) spinner.current.rotation.z += delta * Math.min(95, rpm * prop.maxRpm * Math.PI / 30)
    if (blur.current) blur.current.opacity = THREE.MathUtils.smoothstep(rpm, .27, .68) * .24
    if (blades.current) blades.current.visible = rpm < .62
    surfaces.current.forEach((surface, index) => {
      if (!surface) return
      const pitch = visual.layout === 'flying-wing' ? -controls.current.elevator : 0
      surface.rotation.x = (pitch + (index ? -1 : 1) * controls.current.aileron) * .42
    })
    for (const flap of flaps.current) {
      if (flap) flap.rotation.x = -(state?.current.flapPosition ?? 0) * THREE.MathUtils.degToRad(spec.flaps?.maxAngle ?? 0)
    }
    for (const tail of tails) {
      const control = tailControls.current.get(tail.id)
      if (!control) continue
      control.rotation.x = (tail.kind === 'vtail' ? controls.current.rudder : -controls.current.elevator) * .48
    }
    for (const gear of retractable) {
      const pivot = wheels.current.get(gear.id)
      if (!pivot) continue
      const extension = state?.current.gearPosition ?? 1
      pivot.visible = extension > .035
      const tuck = (1 - extension) * Math.PI / 2
      if (Math.abs(gear.position[1]) < .02) pivot.rotation.x = tuck
      else pivot.rotation.z = tuck * Math.sign(-gear.position[1])
    }
  })
  const radius = visual.fuselageRadius
  const length = visual.fuselageLength
  const nose = visual.noseLength
  const tail = nose - length
  const wingY = -visual.wingY
  const wingZ = -visual.wingZ
  const sweep = Math.tan(THREE.MathUtils.degToRad(visual.sweep))
  const dihedral = Math.tan(THREE.MathUtils.degToRad(visual.dihedral))
  const bladeCount = spec.id === 'warbird1400' ? 3 : 2
  return <group>
    <mesh geometry={fuselage} castShadow>
      <meshPhysicalMaterial vertexColors roughness={.33} clearcoat={.42} clearcoatRoughness={.27} />
    </mesh>
    {prop.kind === 'edf' && <>
      {[-1, 1].map(side => <group key={side} position={[side * radius * .89, -radius * .16, nose - length * .35]} rotation={[0, side * .19, 0]}>
        <mesh position={[-side * .011, -.008, -.054]} scale={[.04, .038, .09]}>
          <sphereGeometry args={[1, 24, 13]} /><meshPhysicalMaterial color={visual.accent} roughness={.34} />
        </mesh>
        <mesh scale={[.65, 1, 1]}>
          <torusGeometry args={[.032, .0055, 10, 28]} /><meshStandardMaterial color={visual.color} roughness={.39} />
        </mesh>
        <mesh position={[0, 0, -.001]} scale={[.65, 1, 1]}>
          <circleGeometry args={[.031, 28]} /><meshStandardMaterial color="#15212a" roughness={.91} />
        </mesh>
      </group>)}
      <group position={[0, 0, tail - .01]} rotation={[0, Math.PI, 0]}>
        <mesh><torusGeometry args={[prop.diameter * .435, .006, 10, 32]} /><meshStandardMaterial color="#78838b" metalness={.72} roughness={.35} /></mesh>
        <mesh><circleGeometry args={[prop.diameter * .43, 32]} /><meshStandardMaterial color="#10181e" roughness={.9} /></mesh>
      </group>
    </>}
    {visual.canopy !== 'none' && <mesh geometry={canopy}>
      <meshPhysicalMaterial vertexColors metalness={.23} roughness={.22} clearcoat={.85} />
    </mesh>}
    {visual.layout === 'high-wing' && visual.gearStyle === 'taildragger' && [-1, 1].map(side => {
      const span = spec.span * .31
      const upper = wingY + span * dihedral
      const bottom = -radius * .7
      return <mesh key={side} position={[side * span / 2, (upper + bottom) / 2, wingZ - span * sweep]}
        rotation={[0, 0, -side * Math.atan2(span, upper - bottom)]} castShadow>
        <cylinderGeometry args={[.005, .006, Math.hypot(span, upper - bottom), 8]} />
        <meshStandardMaterial color={visual.trim} roughness={.53} />
      </mesh>
    })}
    {[-1, 1].map((side, index) => <group key={side} position={[0, wingY, wingZ]} scale={[side, 1, 1]}>
      {wing.map(({ geometry, pivot, control }, piece) => <group key={piece} position={pivot} ref={control ? node => {
        if (control === 'aileron') surfaces.current[index] = node
        else flaps.current[index] = node
      } : undefined}>
        <mesh geometry={geometry} castShadow>
          <meshPhysicalMaterial vertexColors roughness={.37} clearcoat={.28} side={THREE.DoubleSide} />
        </mesh>
      </group>)}
      <mesh position={[spec.span * .493, spec.span * .486 * dihedral + .002, -spec.span * .49 * sweep - .022]}>
        <sphereGeometry args={[Math.max(.004, spec.chord * .023), 12, 8]} />
        <meshStandardMaterial color={side < 0 ? '#eb3639' : '#39c879'} emissive={side < 0 ? '#9a1f25' : '#20734a'} roughness={.28} />
      </mesh>
    </group>)}
    {tailMeshes.map(({ surface, chord, vertical, fixed, moving }) => {
      const [forward, right, down] = surface.arm
      return <group key={surface.id} position={[right, -down + (vertical ? surface.span / 3 : 0), forward]}
        rotation={[0, 0, vertical ? Math.PI / 2 : 0]}>
        <mesh geometry={fixed} castShadow>
          <meshStandardMaterial color={visual.color} roughness={.42} />
        </mesh>
        <group position={[0, 0, -chord * .29]} ref={node => {
          if (node) tailControls.current.set(surface.id, node)
          else tailControls.current.delete(surface.id)
        }}>
          <mesh geometry={moving} castShadow>
            <meshStandardMaterial color={visual.accent} roughness={.47} />
          </mesh>
        </group>
      </group>
    })}
    {spec.gear.filter(gear => gear.kind === 'wheel' || gear.kind === 'float').map(gear => {
      const [forward, right, down] = gear.position
      if (gear.kind === 'float' && gear.steering) {
        return <mesh key={gear.id} position={[right, -down + .025, forward]} castShadow>
          <boxGeometry args={[.009, .09, .052]} /><meshStandardMaterial color={visual.trim} metalness={.28} />
        </mesh>
      }
      return gear.kind === 'float'
        ? <mesh key={gear.id} position={[right, -down, forward]} scale={[radius * .7, .048, length * .33]} castShadow>
          <sphereGeometry args={[1, 20, 10]} /><meshStandardMaterial color={visual.accent} />
        </mesh>
        : <group key={gear.id} position={[right, 0, forward]} ref={node => {
          if (node) wheels.current.set(gear.id, node)
          else wheels.current.delete(gear.id)
        }}>
          <mesh position={[0, -down / 2, 0]}><cylinderGeometry args={[.007, .007, Math.abs(down), 8]} /><meshStandardMaterial color={visual.trim} metalness={.7} /></mesh>
          <mesh position={[0, -down, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[gear.radius, gear.radius, gear.radius * .48, 16]} />
            <meshStandardMaterial color="#252927" roughness={.8} /></mesh>
          {[-1, 1].map(side => <mesh key={side} position={[side * gear.radius * .245, -down, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[gear.radius * .54, gear.radius * .54, gear.radius * .1, 18]} />
            <meshStandardMaterial color="#9da7a9" metalness={.62} roughness={.39} />
          </mesh>)}
        </group>
    })}
    {prop.kind === 'prop' && <group position={[0, 0, visual.layout === 'flying-wing' ? tail : nose]} ref={spinner}>
      <mesh scale={[radius * .48, radius * .48, radius * .65]}><sphereGeometry args={[1, 26, 15]} /><meshPhysicalMaterial color={visual.accent} roughness={.3} clearcoat={.43} /></mesh>
      <group ref={blades}>
        {Array.from({ length: bladeCount }, (_, index) => <mesh key={index} rotation={[0, 0, index * 2 * Math.PI / bladeCount]}
          geometry={blade} scale={[prop.diameter, prop.diameter, prop.diameter]}>
          <meshStandardMaterial color={visual.trim} roughness={.65} />
        </mesh>)}
      </group>
      <mesh><circleGeometry args={[prop.diameter / 2, 32]} />
        <meshBasicMaterial ref={blur} color={visual.trim} opacity={0} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>}
  </group>
}
