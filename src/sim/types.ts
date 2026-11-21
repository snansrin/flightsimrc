import type { Quat, Vec3 } from './math'

export type Controls = {
  /** 0..1. Helicopter: collective/throttle curve. */
  throttle: number
  /** -1..1, positive = roll right. */
  aileron: number
  /** -1..1, positive = nose up. */
  elevator: number
  /** -1..1, positive = nose right. */
  rudder: number
  /** 0..1 flap / camber command. */
  flaps: number
  /** Raw auxiliary channels, -1..1 (gear, brake, gyro gain, flight mode, smoke...). */
  aux: number[]
}
export const zeroControls = (): Controls => ({ throttle: 0, aileron: 0, elevator: 0, rudder: 0, flaps: 0, aux: [0, 0, 0, 0, 0, 0, 0, 0] })
export const cloneControls = (c: Controls): Controls => ({ ...c, aux: [...c.aux] })

export type SurfaceKind = 'wing' | 'htail' | 'vtail' | 'body'
export type ControlRole = 'aileron' | 'elevator' | 'rudder' | 'flap' | 'elevon' | 'none'

/** One aerodynamic component. Selig-style component buildup (AIAA 2010-7635). */
export type Surface = {
  id: string
  kind: SurfaceKind
  area: number
  span: number
  /** Aerodynamic centre relative to CG, body axes (+x nose, +y right, +z down). */
  arm: Vec3
  incidence: number
  clAlpha: number
  cl0: number
  clMax: number
  alphaStall: number
  stallWidth: number
  cd0: number
  oswald: number
  control: ControlRole
  controlSign: number
  controlCl: number
  controlCd: number
  propwash: number
  dihedral: number
  /** Crossflow drag coefficient, body components only. */
  crossflow?: number
}

export type PropSpec = {
  kind: 'prop' | 'edf' | 'none'
  diameter: number
  pitch: number
  maxRpm: number
  idleRpm: number
  /** Static thrust at full rpm, N. */
  staticThrust: number
  spoolTime: number
  /** +1 clockwise seen from behind (torque rolls left). */
  rotation: 1 | -1
  /** Blade/disc polar inertia for gyroscopic moments, kg m^2. */
  inertia: number
  /** Slipstream strength factor applied to surfaces with propwash > 0. */
  slipstream: number
  /** Asymmetric disc loading (P-factor) gain. */
  pFactor: number
}

export type GearKind = 'wheel' | 'skid' | 'float' | 'tip' | 'belly'
export type GearPoint = {
  id: string
  kind: GearKind
  /** Contact point in body axes. */
  position: Vec3
  radius: number
  /** Spring rate N/m and damping N s/m. */
  stiffness: number
  damping: number
  /** Steering gain from rudder (nose/tail wheel). */
  steering: number
  /** Brake authority 0..1. */
  brake: number
  /** Lateral grip coefficient. */
  grip: number
  rollingResistance: number
  /** Retract channel index in aux, -1 = fixed. */
  retractChannel: number
}

export type RotorSpec = {
  kind: 'quad' | 'heli'
  /** Multirotor: per-motor max thrust N. Heli: main rotor disc area m^2. */
  motors?: number
  motorThrust?: number
  motorTime?: number
  motorTorque?: number
  armLength?: number
  /** Heli specifics. */
  discArea?: number
  radius?: number
  headSpeed?: number
  solidity?: number
  bladeLiftSlope?: number
  collectiveMin?: number
  collectiveMax?: number
  cyclicTilt?: number
  flapTime?: number
  hubStiffness?: number
  tailArm?: number
  tailThrust?: number
  gyroGain?: number
}

export type FlightAssistSettings = {
  autoLevel: number
  bankLimit: number
  stallProtection: boolean
  windEffects: boolean
  rateScale: number
}

export type AircraftSpec = {
  id: string
  name: string
  family: 'fixed' | 'multirotor' | 'heli'
  category: string
  summary: string
  skills: string[]
  /** kg */
  mass: number
  /** Diagonal inertia, kg m^2 (roll, pitch, yaw). */
  inertia: Vec3
  /** Reference wing area m^2 (0 for rotorcraft). */
  wingArea: number
  span: number
  chord: number
  surfaces: Surface[]
  prop: PropSpec
  gear: GearPoint[]
  flaps?: { maxAngle: number; maxDeploySpeed: number; wingLift?: number; wingDrag?: number }
  rotor?: RotorSpec
  /** Visual parameters consumed by the parametric model builder. */
  visual: {
    layout: 'high-wing' | 'low-wing' | 'mid-wing' | 'delta' | 'flying-wing' | 'biplane' | 'quad' | 'camera-quad' | 'heli'
    fuselageLength: number
    fuselageRadius: number
    noseLength: number
    tailLength: number
    wingZ: number
    wingY: number
    dihedral: number
    sweep: number
    taper: number
    tailSpan: number
    tailType: 'conventional' | 't-tail' | 'v-tail' | 'none'
    canopy: 'bubble' | 'greenhouse' | 'none' | 'camera'
    color: string
    accent: string
    trim: string
    propBlades: number
    gearStyle: 'tricycle' | 'taildragger' | 'skids' | 'legs' | 'none'
    floats?: boolean
    smoke?: boolean
  }
  /** Flight envelope hints used by lessons and the hangar card. */
  envelope: { cruise: number; stall: number; maxSpeed: number; climb: number; glideRatio: number; hoverThrottle?: number }
  assists: FlightAssistSettings
  /** Default control mixing/expo hints for this airframe. */
  tuning: { expo: number; dualRate: number; throttleCurve: 'linear' | 'heli' | 'quad' }
}

export type SimState = {
  position: Vec3
  velocity: Vec3
  attitude: Quat
  omega: Vec3
  /** Normalized engine/rotor speed 0..1 and per-motor speeds. */
  rpm: number
  motors: number[]
  gearCompression: number[]
  gearPosition: number
  flapPosition: number
  onGround: boolean
  crashed: boolean
  crashReason: string
  stalled: boolean
  airspeed: number
  alpha: number
  beta: number
  gLoad: number
  climbRate: number
  agl: number
  groundSpeed: number
  throttleActual: number
  slipstream: number
  rotorInflow: number
  vortexRing: boolean
  autorotation: boolean
  time: number
  distance: number
  /** Diagnostics for HUD/debrief. */
  lift: number
  drag: number
  thrust: number
  loadFactor: number
}

export type GroundTraction = { rolling: number; braking: number; lateral: number }

export type Environment = {
  /** World-frame wind vector at the aircraft, m/s. */
  wind: Vec3
  turbulence: number
  density: number
  temperature: number
  /** Terrain height (world y) at a world x/z position. */
  groundHeight: (x: number, z: number) => number
  groundTraction?: (x: number, z: number) => GroundTraction
  /** Water surface height, or -Infinity when there is no water. */
  waterHeight: number
  time: number
}
