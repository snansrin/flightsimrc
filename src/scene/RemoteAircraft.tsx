import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Controls } from '../flight'
import type { RemotePilot } from '../multiplayer'
import { VehicleModel } from './Vehicles'

const idle = { current: { throttle: .5, aileron: 0, elevator: 0, rudder: 0 } as Controls }

export function RemoteAircraft({ pilot }: { pilot: RemotePilot }) {
  const model = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!model.current) return
    const factor = 1 - Math.exp(-dt * 8)
    model.current.position.lerp(new THREE.Vector3(...pilot.position), factor)
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pilot.pitch, pilot.yaw, -pilot.roll, 'YXZ'))
    model.current.quaternion.slerp(target, factor)
  })
  return <group ref={model} position={pilot.position}><VehicleModel kind={pilot.vehicle} controls={idle} /></group>
}
