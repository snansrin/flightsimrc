import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import type { AircraftSpec } from '../sim/types'

type Point = [number, number, number]

function wingGeometry(span: number, chord: number, taper: number, sweep: number, dihedral: number) {
  const vertices: number[] = [], indices: number[] = []
  const samples = 24
  for (let ring = 0; ring <= 4; ring++) {
    const fraction = ring / 4
    const localChord = chord * THREE.MathUtils.lerp(1, taper, fraction)
    for (let i = 0; i <= samples; i++) {
      const angle = 2 * Math.PI * i / samples
      const x = (1 - Math.cos(angle)) / 2
      const thickness = .6 * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x ** 2 + .2843 * x ** 3 - .1036 * x ** 4)
      vertices.push(span * fraction, span * fraction * dihedral + thickness * Math.sign(Math.sin(angle)) * localChord,
        (.25 - x) * localChord - span * fraction * sweep)
      if (ring > 0 && i > 0) {
        const point = ring * (samples + 1) + i, previous = point - samples - 1
        indices.push(point, previous, previous - 1, point, previous - 1, point - 1)
      }
    }
  }
  const tip = vertices.length / 3
  vertices.push(span, span * dihedral, -.25 * chord * taper - span * sweep)
  for (let i = 0; i < samples; i++) indices.push(tip, tip - samples - 1 + i, tip - samples + i)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function FixedWing({ spec, controls, state }: { spec: AircraftSpec; controls: React.RefObject<Controls>; state?: React.RefObject<FlightState> }) {
  const { visual, prop } = spec
  const spinner = useRef<THREE.Group>(null)
  const blur = useRef<THREE.MeshBasicMaterial>(null)
  const blades = useRef<THREE.Mesh>(null)
  const surfaces = useRef<(THREE.Group | null)[]>([])
  const tailControls = useRef(new Map<string, THREE.Group>())
  const wheels = useRef(new Map<string, THREE.Group>())
  const tails = useMemo(() => spec.surfaces.filter(surface => surface.kind === 'htail' || surface.kind === 'vtail'), [spec])
  const retractable = useMemo(() => spec.gear.filter(gear => gear.kind === 'wheel' && gear.retractChannel >= 0), [spec])
  const geometry = useMemo(() => {
    const angle = (degrees: number) => Math.tan(THREE.MathUtils.degToRad(degrees))
    return wingGeometry(spec.span / 2, spec.chord * 2 / (1 + visual.taper), visual.taper, angle(visual.sweep), angle(visual.dihedral))
  }, [spec, visual])
  useEffect(() => () => geometry.dispose(), [geometry])
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
    for (const tail of tails) {
      const control = tailControls.current.get(tail.id)
      if (!control) continue
      control.rotation.x = (tail.kind === 'vtail' ? controls.current.rudder : -controls.current.elevator) * .48
    }
    for (const gear of retractable) {
      const pivot = wheels.current.get(gear.id)
      if (pivot) pivot.rotation.z = (1 - (state?.current.gearPosition ?? 1)) * Math.PI / 2 * (gear.position[1] < 0 ? 1 : -1)
    }
  })
  const radius = visual.fuselageRadius
  const length = visual.fuselageLength
  const nose = visual.noseLength
  const tail = nose - length
  const wingY = -visual.wingY
  const wingZ = -visual.wingZ
  const bodyPosition: Point = [0, 0, nose - length / 2]
  const sweep = Math.tan(THREE.MathUtils.degToRad(visual.sweep))
  const dihedral = Math.tan(THREE.MathUtils.degToRad(visual.dihedral))
  const flapX = spec.span * .34
  return <group>
    <mesh position={bodyPosition} scale={[radius, radius * .9, length * .50]} castShadow>
      <sphereGeometry args={[1, 32, 16]} /><meshStandardMaterial color={visual.color} roughness={.43} />
    </mesh>
    {visual.canopy !== 'none' && <mesh position={[0, radius * .6, nose * .24]} scale={[radius * .85, radius * .65, length * .19]}>
      <sphereGeometry args={[1, 24, 14]} /><meshPhysicalMaterial color={visual.trim} metalness={.3} roughness={.14} clearcoat={.85} />
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
    {[-1, 1].map((side, index) => <group key={side}>
      <mesh position={[0, wingY, wingZ]} scale={[side, 1, 1]} geometry={geometry} castShadow>
        <meshStandardMaterial color={visual.color} roughness={.49} side={THREE.DoubleSide} />
      </mesh>
      <group position={[side * flapX, wingY + flapX * dihedral, wingZ - flapX * sweep - spec.chord * .63]}
        ref={node => { surfaces.current[index] = node }}>
        <mesh position={[0, 0, -spec.chord * .05]} castShadow>
          <boxGeometry args={[spec.span * .25, .012, spec.chord * .13]} /><meshStandardMaterial color={visual.accent} />
        </mesh>
      </group>
      <mesh position={[side * spec.span * .48, wingY + spec.span * .48 * dihedral + .007, wingZ - spec.span * .48 * sweep]}>
        <sphereGeometry args={[Math.max(.012, spec.chord * .069), 12, 8]} />
        <meshStandardMaterial color={visual.accent} roughness={.43} />
      </mesh>
    </group>)}
    {tails.map(surface => {
      const [forward, right, down] = surface.arm
      const vertical = surface.kind === 'vtail'
      const chord = surface.area / surface.span
      return <group key={surface.id} position={[right, -down + (vertical ? surface.span / 3 : 0), forward]}
        rotation={[0, 0, vertical ? Math.PI / 2 : 0]}>
        <mesh position={[0, 0, chord * .11]} castShadow>
          <boxGeometry args={[surface.span, .012, chord * .78]} />
          <meshStandardMaterial color={visual.color} roughness={.46} />
        </mesh>
        <group position={[0, 0, -chord * .28]} ref={node => {
          if (node) tailControls.current.set(surface.id, node)
          else tailControls.current.delete(surface.id)
        }}>
          <mesh position={[0, 0, -chord * .11]} castShadow>
            <boxGeometry args={[surface.span * .94, .009, chord * .22]} />
            <meshStandardMaterial color={visual.accent} roughness={.52} />
          </mesh>
        </group>
      </group>
    })}
    {spec.gear.filter(gear => gear.kind === 'wheel' || gear.kind === 'float').map(gear => {
      const [forward, right, down] = gear.position
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
        </group>
    })}
    {prop.kind === 'prop' && <group position={[0, 0, visual.layout === 'flying-wing' ? tail : nose]} ref={spinner}>
      <mesh scale={[.025, .025, .045]}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color={visual.accent} /></mesh>
      <mesh ref={blades}><boxGeometry args={[prop.diameter, .017, .005]} /><meshStandardMaterial color={visual.trim} roughness={.67} /></mesh>
      <mesh><circleGeometry args={[prop.diameter / 2, 32]} />
        <meshBasicMaterial ref={blur} color={visual.trim} opacity={0} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>}
  </group>
}
