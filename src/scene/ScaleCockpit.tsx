import type { AircraftSpec } from '../sim/types'

export function ScaleCockpit({ spec }: { spec: AircraftSpec }) {
  const { fuselageRadius: r, fuselageLength: l, noseLength: nose } = spec.visual
  const jet = spec.prop.kind === 'edf'
  const tandem = spec.id === 'warbird1400' || jet
  const front = nose - l * (jet ? .21 : .162)
  return <group position={[0, r * .86, front]}>
    <mesh position={[0, -.002, -l * .145]} scale={[r * .68, r * .23, l * .119]}>
      <sphereGeometry args={[1, 24, 12]} /><meshStandardMaterial color="#232d34" roughness={.8} />
    </mesh>
    {(tandem ? [.103, .211] : [.137]).map((station, index) => <group key={station} position={[0, 0, -l * station]}>
      <mesh position={[0, r * .16, -l * .015]} rotation={[-.14, 0, 0]} scale={[r * .43, r * .29, r * .12]}>
        <sphereGeometry args={[1, 20, 12]} /><meshPhysicalMaterial color={jet ? '#485a67' : '#706a50'} roughness={.79} />
      </mesh>
      <mesh position={[0, r * .04, l * .028]} rotation={[-.28, 0, 0]}>
        <boxGeometry args={[r * .82, r * .19, r * .16]} /><meshStandardMaterial color="#151d24" roughness={.72} />
      </mesh>
      {[-1, 0, 1].map(dial => <mesh key={dial} position={[dial * r * .198, r * .105, l * .024]}>
        <sphereGeometry args={[r * .05, 10, 7]} /><meshStandardMaterial color={index === 0 && dial === 0 ? '#68c5a5' : '#bec8c5'} roughness={.4} />
      </mesh>)}
      <mesh position={[0, r * .065, l * .011]} rotation={[.27, 0, 0]}>
        <cylinderGeometry args={[r * .032, r * .045, r * .19, 10]} /><meshStandardMaterial color="#645f53" roughness={.62} />
      </mesh>
    </group>)}
  </group>
}
