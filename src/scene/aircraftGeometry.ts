import * as THREE from 'three'
import type { AircraftSpec } from '../sim/types'

type Frame = [station: number, halfWidth: number, halfHeight: number, verticalCenter: number]
type Piece = { geometry: THREE.BufferGeometry; pivot: THREE.Vector3; control?: 'aileron' | 'flap' }

const noses: Record<string, Frame[]> = {
  trainer1500: [[0,.12,.19,.33],[.12,.25,.29,.25],[.28,.42,.46,.17],[.47,.72,.68,.04],[.58,.98,.94,0],[.68,1.02,1.07,.01],[.79,.93,1,.04],[.91,.77,.8,.04],[.985,.65,.64,0],[1,.38,.42,0]],
  cub800: [[0,.10,.15,.38],[.15,.19,.28,.31],[.35,.39,.5,.18],[.55,.74,.86,-.09],[.65,.92,1.04,-.08],[.8,.95,1.05,0],[.92,.81,.85,.04],[1,.48,.52,.02]],
  extra330: [[0,.1,.18,.12],[.15,.28,.34,.18],[.37,.5,.65,.1],[.55,.86,1.01,0],[.69,1,1.11,-.02],[.85,.94,.86,-.12],[.966,.78,.7,-.12],[1,.55,.56,-.05]],
  warbird1400: [[0,.13,.26,.3],[.12,.28,.41,.24],[.31,.44,.63,.14],[.48,.69,.86,.05],[.61,.89,1.07,.03],[.75,1.04,1.15,-.12],[.9,1.04,1.02,-.02],[.97,.91,.88,0],[1,.74,.76,0]],
  edf90: [[0,.62,.62,.02],[.03,.66,.68,.02],[.12,.65,.68,.01],[.27,.75,.76,.02],[.45,.89,.94,-.04],[.58,1.08,1.04,-.09],[.68,.93,.93,-.03],[.78,.66,.72,-.04],[.87,.42,.46,-.07],[.95,.23,.27,-.11],[1,.022,.025,-.12]],
  glider2000: [[0,.1,.13,.1],[.19,.17,.21,.13],[.42,.25,.29,.06],[.58,.53,.54,-.045],[.69,1,1.08,0],[.78,1.04,1.14,0],[.87,.83,.88,-.05],[.96,.53,.53,-.12],[1,.22,.24,-.12]],
  wing1000: [[0,.58,.49,0],[.13,.74,.6,0],[.41,.93,.77,0],[.58,1.12,.87,0],[.78,1,.82,0],[.93,.59,.51,0],[1,.08,.1,0]],
  float1200: [[0,.12,.19,.32],[.14,.28,.33,.24],[.35,.48,.52,.11],[.52,.8,.8,.02],[.66,1.03,1.06,0],[.8,1.01,1.03,.03],[.96,.76,.78,.03],[1,.53,.55,.03]],
}

function meshData(points: number[], indices: number[], colors?: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function loft(profile: Frame[], length: number, radius: number, tip: number, colorAt?: (station: number, side: number, height: number) => THREE.Color) {
  const radial = 48, rows = 96, stride = radial + 1
  const points: number[] = [], colors: number[] = [], indices: number[] = []
  const stations = profile.map(row => row[0])
  const sections = new THREE.CatmullRomCurve3(profile.map(([, x, y, center]) => new THREE.Vector3(x, y, center)), false, 'catmullrom')
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, index = Math.min(profile.length - 2, Math.floor(t * (profile.length - 1)))
    const station = THREE.MathUtils.lerp(stations[index], stations[index + 1], t * (profile.length - 1) - index)
    const shape = sections.getPoint(t)
    for (let side = 0; side <= radial; side++) {
      const angle = 2 * Math.PI * side / radial
      const horizontal = Math.cos(angle), vertical = Math.sin(angle)
      points.push(radius * shape.x * horizontal, radius * (shape.z + shape.y * vertical), tip + length * (station - 1))
      colorAt?.(station, horizontal, vertical).toArray(colors, colors.length)
      if (!row || !side) continue
      const at = row * stride + side
      indices.push(at - stride - 1, at - stride, at - 1, at - stride, at, at - 1)
    }
  }
  // Close the nose and rear cut planes. EDF's exhaust is a separate assembly.
  for (let side = 1; side < radial; side++) indices.push(0, side + 1, side, rows * stride, rows * stride + side, rows * stride + side + 1)
  return meshData(points, indices, colorAt ? colors : undefined)
}

export function fuselageGeometry(spec: AircraftSpec) {
  const { visual } = spec
  const paint = new THREE.Color(visual.color), stripe = new THREE.Color(visual.accent), trim = new THREE.Color(visual.trim)
  const profile = noses[spec.id] ?? noses.trainer1500
  return loft(profile, visual.fuselageLength, visual.fuselageRadius, visual.noseLength, (s, side, height) => {
    if (spec.prop.kind === 'edf' && s > .94) return trim
    if (Math.abs(side) > .64 && Math.abs(height - (s * .60 - .28)) < (spec.prop.kind === 'edf' ? .23 : .14)) return stripe
    if (spec.id === 'warbird1400' && s > .89) return stripe
    if (height < -.82 && s > .19 && s < .88) return paint.clone().lerp(trim, .19)
    return paint
  })
}

export function cabinGeometry(spec: AircraftSpec) {
  const radius = spec.visual.fuselageRadius
  const length = spec.visual.fuselageLength
  const jet = spec.prop.kind === 'edf'
  const frames: Frame[] = jet
    ? [[0,.06,.052,.57],[.16,.55,.33,.77],[.39,.82,.43,.84],[.62,.74,.39,.77],[.81,.46,.28,.68],[1,.06,.045,.5]]
    : [[0,.055,.05,.7],[.18,.69,.39,.79],[.41,.8,.48,.84],[.63,.78,.46,.83],[.83,.56,.33,.76],[1,.03,.035,.55]]
  const glint = new THREE.Color(jet ? '#3d728a' : '#4a7282'), shadow = new THREE.Color('#182830'), frame = new THREE.Color(spec.visual.trim)
  return loft(frames, length * (jet ? .29 : .255), radius, spec.visual.noseLength - length * (jet ? .21 : .162), (station, _, height) => {
    if (station < .095 || station > .91 || station > .54 && station < .583 || height < -.55) return frame
    return shadow.clone().lerp(glint, Math.min(1, (height + .5) * .68))
  })
}

export function wingPieces(spec: AircraftSpec): Piece[] {
  const span = spec.span / 2, { visual } = spec
  const sweep = Math.tan(THREE.MathUtils.degToRad(visual.sweep))
  const dihedral = Math.tan(THREE.MathUtils.degToRad(visual.dihedral))
  const chord = spec.chord * 2 / (1 + visual.taper)
  const base = new THREE.Color(visual.color), accent = new THREE.Color(visual.accent), trim = new THREE.Color(visual.trim)
  const wing = (fraction: number, section: number, top: number) => {
    const c = chord * THREE.MathUtils.lerp(1, visual.taper, fraction) * (1 - .48 * THREE.MathUtils.smoothstep(fraction, .93, 1))
    const thickness = .6 * (.2969 * Math.sqrt(section) - .126 * section - .3516 * section ** 2 + .2843 * section ** 3 - .1036 * section ** 4)
    const camber = (spec.id === 'extra330' ? 0 : .023) * Math.sin(section * Math.PI)
    return new THREE.Vector3(span * fraction, span * fraction * dihedral + c * (thickness * top + camber), (.25 - section) * c - span * fraction * sweep)
  }
  const make = (start: number, end: number, front: number, rear: number, control?: Piece['control']): Piece => {
    const rows = Math.max(3, Math.ceil((end - start) * 52)), columns = 40, stride = columns + 1
    const points: number[] = [], colors: number[] = [], indices: number[] = []
    const pivot = control ? wing((start + end) / 2, front, 0) : new THREE.Vector3()
    for (let row = 0; row <= rows; row++) {
      const s = THREE.MathUtils.lerp(start, end, row / rows)
      for (let col = 0; col <= columns; col++) {
        const angle = col / columns * Math.PI * 2, top = Math.sin(angle)
        const section = THREE.MathUtils.lerp(front, rear, (1 - Math.cos(angle)) / 2)
        const point = wing(s, section, Math.sign(top)).sub(pivot)
        point.toArray(points, points.length)
        const pattern = s + .13 * section
        const color = s > .95 || pattern > .66 && pattern < .83 || spec.id === 'warbird1400' && section < .12 ? accent
          : pattern > .63 && pattern < .66 || control && section < front + .025 ? trim : base
        color.toArray(colors, colors.length)
        if (!row || !col) continue
        const i = row * stride + col
        indices.push(i, i - stride, i - stride - 1, i, i - stride - 1, i - 1)
      }
    }
    for (let col = 1; col < columns; col++) indices.push(0, col + 1, col, rows * stride, rows * stride + col, rows * stride + col + 1)
    return { geometry: meshData(points, indices, colors), pivot, control }
  }
  return [
    make(0, .17, 0, 1),
    ...(spec.flaps ? [make(.17, .53, 0, .715), make(.173, .527, .72, 1, 'flap')] : [make(.17, .53, 0, 1)]),
    make(.53, .95, 0, .731), make(.533, .947, .736, 1, 'aileron'), make(.95, 1, 0, 1),
  ]
}

export function empennageGeometry(span: number, chord: number, vertical: boolean, moving: boolean) {
  const outline = new THREE.Shape()
  const half = span / 2
  if (moving) {
    outline.moveTo(-half * .91, 0)
    outline.lineTo(half * .89, 0)
    outline.lineTo(half * .75, -chord * .24)
    outline.lineTo(-half * .79, -chord * .31)
  } else {
    outline.moveTo(-half, -chord * .27)
    outline.lineTo(-half * .94, chord * .42)
    outline.quadraticCurveTo(0, chord * .46, half * .66, chord * (vertical ? .1 : .26))
    outline.quadraticCurveTo(half, chord * .2, half, -chord * .25)
  }
  outline.closePath()
  const thickness = chord * (moving ? .028 : .042)
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: thickness, steps: 1, bevelEnabled: true, bevelThickness: thickness * .28, bevelSize: thickness * .46, bevelSegments: 2,
  })
  geometry.translate(0, 0, -thickness / 2)
  geometry.rotateX(Math.PI / 2)
  return geometry
}
