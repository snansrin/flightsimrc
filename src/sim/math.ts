// Body axes: +x nose, +y right wing, +z down (aerospace).
// World axes: three.js right-handed, +x east/right, +y up, +z south. Nose at zero attitude points -z (north).
export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number] // x, y, z, w

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const normalize = (a: Vec3): Vec3 => { const l = length(a); return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0] }
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1)
  return t * t * (3 - 2 * t)
}
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-clamp(x, -60, 60)))
export const deg = (r: number): number => (r * 180) / Math.PI
export const rad = (d: number): number => (d * Math.PI) / 180
export const wrapPi = (a: number): number => { const t = (a + Math.PI) % (2 * Math.PI); return (t < 0 ? t + 2 * Math.PI : t) - Math.PI }

export const qIdentity = (): Quat => [0, 0, 0, 1]
export const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
export const qConj = (a: Quat): Quat => [-a[0], -a[1], -a[2], a[3]]
export const qNormalize = (a: Quat): Quat => {
  const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1
  return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]
}
/** Rotate a vector by a quaternion (v' = q v q*). */
export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [
    v[0] + w * tx + y * tz - z * ty,
    v[1] + w * ty + z * tx - x * tz,
    v[2] + w * tz + x * ty - y * tx,
  ]
}
export const qFromAxisAngle = (axis: Vec3, angle: number): Quat => {
  const n = normalize(axis), s = Math.sin(angle / 2)
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)]
}
/** Body(+x nose,+y right,+z down) -> world(+x right,+y up,-z nose). 120 deg about (1,1,-1). */
export const Q_BODY_TO_WORLD: Quat = [0.5, 0.5, -0.5, 0.5]
export const Q_WORLD_TO_BODY: Quat = qConj(Q_BODY_TO_WORLD)

/** Attitude quaternion in world frame from aerospace yaw/pitch/roll. */
export const attitudeQuat = (yaw: number, pitch: number, roll: number): Quat => {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2)
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2)
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2)
  // ZYX intrinsic: q = qz(yaw) * qy(pitch) * qx(roll)
  const aero: Quat = [
    cy * cp * sr - sy * sp * cr,
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * cr + sy * sp * sr,
  ]
  return qNormalize(qMul(Q_BODY_TO_WORLD, aero))
}
/** Aerospace yaw/pitch/roll from a world-frame attitude quaternion. */
export const attitudeEuler = (q: Quat): { yaw: number; pitch: number; roll: number } => {
  const a = qMul(Q_WORLD_TO_BODY, q)
  const [x, y, z, w] = a
  const sinp = clamp(2 * (w * y - z * x), -1, 1)
  const pitch = Math.asin(sinp)
  const roll = Math.abs(sinp) > 0.9999 ? 0 : Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
  const yaw = Math.abs(sinp) > 0.9999 ? Math.atan2(-2 * (x * z - w * y), 1 - 2 * (y * y + z * z)) : Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  return { yaw, pitch, roll }
}
/** q' = q + 0.5 * q * (0, omega) * dt, omega in body axes. */
export const qIntegrate = (q: Quat, omega: Vec3, dt: number): Quat => qNormalize([
  q[0] + 0.5 * dt * (q[3] * omega[0] + q[1] * omega[2] - q[2] * omega[1]),
  q[1] + 0.5 * dt * (q[3] * omega[1] - q[0] * omega[2] + q[2] * omega[0]),
  q[2] + 0.5 * dt * (q[3] * omega[2] + q[0] * omega[1] - q[1] * omega[0]),
  q[3] + 0.5 * dt * (-q[0] * omega[0] - q[1] * omega[1] - q[2] * omega[2]),
])
/** Diagonal inertia tensor inverse applied to a vector. */
export const inertiaApply = (inertia: Vec3, w: Vec3): Vec3 => [inertia[0] * w[0], inertia[1] * w[1], inertia[2] * w[2]]
export const inertiaInverse = (inertia: Vec3, m: Vec3): Vec3 => [m[0] / inertia[0], m[1] / inertia[1], m[2] / inertia[2]]

/** Deterministic value noise, used for terrain and turbulence. */
export const hash2 = (x: number, y: number, seed = 0): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
export const valueNoise = (x: number, y: number, seed = 0): number => {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed)
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1
}
export const fbm = (x: number, y: number, octaves = 5, seed = 0, lacunarity = 2.03, gain = 0.5): number => {
  let sum = 0, amp = 1, freq = 1, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 17)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / (norm || 1)
}
