import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls, FlightState } from '../flight'
import { hangarAircraft } from '../hangar'
import type { RemotePilot } from '../multiplayer'
import { airfieldPilotPosition, type Field } from '../sim/fields'
import { Airfield } from './Airfield'
import { VehicleModel } from './Vehicles'
import { RemoteAircraft } from './RemoteAircraft'
import { chaseFraming } from './cameraFraming'
import { EarthTerrain } from './EarthTerrain'
import type { WorldTerrain } from '../sim/worldTerrain'

export type CameraMode = 'chase' | 'pilot' | 'onboard' | 'overview' | 'inspect'
export type FlightFrame = { previous: FlightState; current: FlightState; fraction: number }
function Aircraft({ state, flightFrame, controls, cameraMode, zoom, vehicle, field }: {
  state: React.RefObject<FlightState>; flightFrame: React.RefObject<FlightFrame | null>; controls: React.RefObject<Controls>
  cameraMode: CameraMode; zoom: number; vehicle: string; field: Field
}) {
  const ref = useRef<THREE.Group>(null)
  const vectors = useMemo(() => ({
    desired: new THREE.Vector3(), target: new THREE.Vector3(),
    forward: new THREE.Vector3(), sample: new THREE.Vector3(), attitude: new THREE.Euler(), orientation: new THREE.Quaternion(),
  }), [])
  const aircraft = hangarAircraft(vehicle)
  const pilot = useMemo(() => airfieldPilotPosition(field), [field])
  const isRotor = aircraft.family !== 'fixed'
  useFrame(({ camera }, dt) => {
    const aircraftGroup = ref.current
    if (!aircraftGroup) return
    const s = state.current
    const frame = flightFrame.current
    const { position, quaternion } = aircraftGroup
    const { attitude, orientation, desired, target, forward, sample } = vectors
    position.set(...s.position)
    quaternion.setFromEuler(attitude.set(-s.pitch, s.yaw, -s.roll, 'YXZ'))
    if (frame?.current === s) {
      const previous = frame.previous
      position.lerp(sample.set(...previous.position), 1 - frame.fraction)
      orientation.setFromEuler(attitude.set(-previous.pitch, previous.yaw, -previous.roll, 'YXZ'))
      quaternion.slerp(orientation, 1 - frame.fraction)
    }
    const yaw = attitude.setFromQuaternion(quaternion, 'YXZ').y
    const chase = chaseFraming(aircraft.span, zoom)
    const chaseDistance = chase.distance
    const chaseHeight = isRotor ? .65 + aircraft.span * .35 : 1.1
    forward.set(0, 0, 1).applyQuaternion(quaternion)
    if (cameraMode === 'pilot') desired.set(...pilot)
    else if (cameraMode === 'onboard') desired.set(0, .2, aircraft.visual.noseLength + .12).applyQuaternion(quaternion).add(position)
    else if (cameraMode === 'overview') {
      const height = field.orthophoto ? field.orthophoto.width * .17 : field.runway.length ? 150 : 800
      desired.set(position.x, position.y + height / zoom, position.z - 5)
    }
    else if (cameraMode === 'inspect') {
      desired.set(chaseDistance * .73, chaseDistance * .42, chaseDistance * .76).applyAxisAngle(camera.up.set(0, 1, 0), yaw).add(position)
      desired.y = Math.max(desired.y, field.height(desired.x, -desired.z) + .2)
    }
    else {
      desired.set(position.x - Math.sin(yaw) * chaseDistance, position.y + chaseHeight, position.z - Math.cos(yaw) * chaseDistance)
      desired.y = Math.max(desired.y, field.height(desired.x, -desired.z) + .38, field.waterLevel + .38)
    }
    camera.position.lerp(desired, cameraMode === 'onboard' ? 1 : 1 - Math.exp(-dt * 8))
    if (cameraMode === 'onboard') {
      camera.up.set(0, 1, 0).applyQuaternion(quaternion)
      camera.lookAt(target.copy(desired).addScaledVector(forward, 20))
    } else {
      if (cameraMode === 'overview') camera.up.set(0, 0, 1)
      else camera.up.set(0, 1, 0)
      camera.lookAt(target.copy(position).addScaledVector(forward, cameraMode === 'chase' ? .45 : 0))
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = cameraMode === 'pilot' ? 58 / zoom : cameraMode === 'onboard' ? THREE.MathUtils.clamp(75 / zoom, 40, 100) : chase.fov
      const near = cameraMode === 'overview' ? 1 : .025
      if (camera.near !== near || Math.abs(camera.fov - fov) > .01) {
        camera.near = near
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
  })
  return <group ref={ref}>{cameraMode !== 'onboard' && <VehicleModel kind={vehicle} controls={controls} state={state} />}</group>
}
export default function FlightScene({ state, flightFrame, controls, field, cameraMode, zoom, vehicle, peers, world, onImagery }: {
  state: React.RefObject<FlightState>; flightFrame: React.RefObject<FlightFrame | null>; controls: React.RefObject<Controls>; field: Field; cameraMode: CameraMode;
  zoom: number; vehicle: string; peers: RemotePilot[]; world?: WorldTerrain;
  onImagery: (state: 'loading' | 'ready' | 'unavailable') => void;
}) {
  return <Canvas key={world ? [world.point.longitude, world.point.latitude].join(',') : 'practice'}
    camera={{ position: world ? [0, 140, -4] : [0, 1.4, -4], fov: 58, near: .025, far: world ? 62000 : 2000 }}
    dpr={[1, 1.5]} shadows={!world} gl={{ antialias: true, logarithmicDepthBuffer: Boolean(world), toneMapping: THREE.ACESFilmicToneMapping }}>
    {world ? <EarthTerrain key={field.id} world={world} flight={state} onImagery={onImagery} /> : <Airfield field={field} />}
    <Aircraft state={state} flightFrame={flightFrame} controls={controls} cameraMode={cameraMode} zoom={zoom} vehicle={vehicle} field={field} />
    {peers.map(pilot => <RemoteAircraft key={pilot.id} pilot={pilot} />)}
  </Canvas>
}
