import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls } from '../flight'
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

export function FixedWing({ spec, controls }: { spec: AircraftSpec; controls: React.RefObject<Controls> }) {
  const { visual, prop } = spec
  const spinner = useRef<THREE.Group>(null)
  const surfaces = useRef<(THREE.Group | null)[]>([])
  const geometry = useMemo(() => {
    const angle = (degrees: number) => Math.tan(THREE.MathUtils.degToRad(degrees))
    return wingGeometry(spec.span / 2, spec.chord * 2 / (1 + visual.taper), visual.taper, angle(visual.sweep), angle(visual.dihedral))
  }, [spec, visual])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((_, delta) => {
    if (spinner.current) spinner.current.rotation.z += delta * (6 + 120 * controls.current.throttle)
    surfaces.current.forEach((surface, index) => {
      if (!surface) return
      const pitch = visual.layout === 'flying-wing' ? -controls.current.elevator : 0
      surface.rotation.x = (pitch + (index ? -1 : 1) * controls.current.aileron) * .42
    })
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
    </group>)}
    {spec.surfaces.filter(surface => surface.kind === 'htail' || surface.kind === 'vtail').map(surface => {
      const [forward, right, down] = surface.arm
      const vertical = surface.kind === 'vtail'
      return <mesh key={surface.id} position={[right, -down + (vertical ? surface.span / 3 : 0), forward]}
        rotation={[0, 0, vertical ? Math.PI / 2 : 0]} castShadow>
        <boxGeometry args={[surface.span, .012, surface.area / surface.span]} />
        <meshStandardMaterial color={vertical ? visual.accent : visual.color} roughness={.46} />
      </mesh>
    })}
    {spec.gear.filter(gear => gear.kind === 'wheel' || gear.kind === 'float').map(gear => {
      const [forward, right, down] = gear.position
      return gear.kind === 'float'
        ? <mesh key={gear.id} position={[right, -down, forward]} scale={[radius * .7, .048, length * .33]} castShadow>
          <sphereGeometry args={[1, 20, 10]} /><meshStandardMaterial color={visual.accent} />
        </mesh>
        : <group key={gear.id} position={[right, -down, forward]}>
          <mesh position={[0, down / 2, 0]}><cylinderGeometry args={[.007, .007, down, 8]} /><meshStandardMaterial color={visual.trim} metalness={.7} /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[gear.radius, gear.radius, gear.radius * .48, 16]} />
            <meshStandardMaterial color="#252927" roughness={.8} /></mesh>
        </group>
    })}
    {prop.kind === 'prop' && <group position={[0, 0, visual.layout === 'flying-wing' ? tail : nose]} ref={spinner}>
      <mesh scale={[.025, .025, .045]}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color={visual.accent} /></mesh>
      <mesh><boxGeometry args={[prop.diameter, .017, .005]} /><meshStandardMaterial color={visual.trim} roughness={.67} /></mesh>
    </group>}
  </group>
}
