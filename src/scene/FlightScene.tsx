import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import { hangarAircraft } from '../hangar'
import type { RemotePilot } from '../multiplayer'
import type { Field } from '../sim/fields'
import { Airfield, airfieldPilotPosition } from './Airfield'
import { VehicleModel } from './Vehicles'
import { RemoteAircraft } from './RemoteAircraft'

export type CameraMode = 'chase' | 'pilot' | 'onboard'
function Aircraft({ state, controls, cameraMode, zoom, vehicle, field }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; cameraMode: CameraMode; zoom: number; vehicle: string; field: Field }) {
  const ref = useRef<THREE.Group>(null)
  const vectors = useMemo(() => ({
    desired: new THREE.Vector3(), target: new THREE.Vector3(),
    forward: new THREE.Vector3(), attitude: new THREE.Euler(),
  }), [])
  const aircraft = hangarAircraft(vehicle)
  const pilot = useMemo(() => airfieldPilotPosition(field), [field])
  const isRotor = aircraft.family !== 'fixed'
  useFrame(({ camera }, dt) => {
    const s = state.current
    if (!ref.current) return
    ref.current.position.set(...s.position)
    ref.current.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const chaseDistance = Math.max(1.35, aircraft.span * 2.1) * zoom
    const chaseHeight = isRotor ? .65 + aircraft.span * .35 : 1.1
    const { attitude, desired, target, forward } = vectors
    attitude.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    forward.set(0, 0, 1).applyEuler(attitude)
    if (cameraMode === 'pilot') desired.set(...pilot)
    else if (cameraMode === 'onboard') desired.set(0, .2, aircraft.visual.noseLength + .12).applyEuler(attitude).add(ref.current.position)
    else desired.set(s.position[0] - Math.sin(s.yaw) * chaseDistance, s.position[1] + chaseHeight, s.position[2] - Math.cos(s.yaw) * chaseDistance)
    camera.position.lerp(desired, cameraMode === 'onboard' ? 1 : 1 - Math.exp(-dt * 8))
    if (cameraMode === 'onboard') {
      camera.up.set(0, 1, 0).applyEuler(attitude)
      camera.lookAt(target.copy(desired).addScaledVector(forward, 20))
    } else {
      camera.up.set(0, 1, 0)
      camera.lookAt(target.set(...s.position).addScaledVector(forward, cameraMode === 'pilot' ? 0 : .45))
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = cameraMode === 'pilot' ? 58 / zoom : cameraMode === 'onboard' ? THREE.MathUtils.clamp(75 / zoom, 40, 100) : 58
      if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix() }
    }
  })
  return <group ref={ref}>{cameraMode !== "onboard" && <VehicleModel kind={vehicle} controls={controls} />}</group>
}
export default function FlightScene({ state, controls, field, cameraMode, zoom, vehicle, peers }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; field: Field; cameraMode: CameraMode; zoom: number; vehicle: string; peers: RemotePilot[] }) {
  return <Canvas camera={{ position: [0, 1.4, -4], fov: 58, near: .025, far: 1100 }} dpr={[1, 1.5]} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
    <Airfield field={field} /><Aircraft state={state} controls={controls} cameraMode={cameraMode} zoom={zoom} vehicle={vehicle} field={field} />
    {peers.map(pilot => <RemoteAircraft key={pilot.id} pilot={pilot} />)}
  </Canvas>
}
