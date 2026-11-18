import { rad, type Vec3 } from './math'
import type { AircraftSpec, GearPoint, PropSpec, Surface } from './types'

/**
 * RC aircraft catalogue. Masses, spans and power levels follow common hobby-class
 * airframes; aerodynamic coefficients are low-Reynolds engineering estimates
 * (Selig AIAA 2010-7635 component method, SAE Aero Design RC performance notes).
 * Nothing here is manufacturer-certified data.
 */

type WingOptions = {
  id: string
  area: number
  span: number
  arm: Vec3
  incidence?: number
  dihedral?: number
  clAlpha?: number
  cl0?: number
  clMax?: number
  alphaStall?: number
  cd0?: number
  oswald?: number
  control?: Surface['control']
  controlCl?: number
  controlCd?: number
  propwash?: number
}

/** Left/right panels so roll damping and dihedral effect come out of the physics. */
function wingPair(o: WingOptions): Surface[] {
  const base = {
    kind: 'wing' as const,
    area: o.area / 2,
    span: o.span / 2,
    incidence: o.incidence ?? rad(2),
    clAlpha: o.clAlpha ?? 4.2,
    cl0: o.cl0 ?? 0.25,
    clMax: o.clMax ?? 1.25,
    alphaStall: o.alphaStall ?? rad(13),
    stallWidth: rad(3.2),
    cd0: o.cd0 ?? 0.018,
    oswald: o.oswald ?? 0.8,
    control: o.control ?? 'aileron',
    controlCl: o.controlCl ?? 0.4,
    controlCd: o.controlCd ?? 0.06,
    propwash: o.propwash ?? 0.35,
  }
  const dihedral = o.dihedral ?? rad(3)
  return [1, -1].map(side => ({
    ...base,
    id: `${o.id}-${side > 0 ? 'right' : 'left'}`,
    arm: [o.arm[0], side * Math.abs(o.arm[1] || o.span * 0.24), o.arm[2]] as Vec3,
    controlSign: side > 0 ? -1 : 1,
    dihedral: side * dihedral,
  }))
}

function tailPlane(o: { id: string; area: number; span: number; arm: Vec3; controlCl?: number; propwash?: number; clAlpha?: number; incidence?: number }): Surface {
  return {
    id: o.id, kind: 'htail', area: o.area, span: o.span, arm: o.arm, incidence: o.incidence ?? rad(-1.5),
    clAlpha: o.clAlpha ?? 3.7, cl0: 0, clMax: 1.1, alphaStall: rad(17), stallWidth: rad(4),
    cd0: 0.014, oswald: 0.75, control: 'elevator', controlSign: -1,
    controlCl: o.controlCl ?? 0.5, controlCd: 0.05, propwash: o.propwash ?? 0.5, dihedral: 0,
  }
}

function fin(o: { id: string; area: number; span: number; arm: Vec3; controlCl?: number; propwash?: number }): Surface {
  return {
    id: o.id, kind: 'vtail', area: o.area, span: o.span, arm: o.arm, incidence: 0,
    clAlpha: 3.2, cl0: 0, clMax: 1.05, alphaStall: rad(20), stallWidth: rad(5),
    cd0: 0.014, oswald: 0.7, control: 'rudder', controlSign: 1,
    controlCl: o.controlCl ?? 0.4, controlCd: 0.07, propwash: o.propwash ?? 0.55, dihedral: 0,
  }
}

function bodyParts(length: number, radius: number, cgOffset = 0): Surface[] {
  const side = length * radius * 1.15
  return [
    {
      id: 'nose', kind: 'body', area: side * 0.45, span: 0, arm: [length * 0.28 - cgOffset, 0, 0],
      incidence: 0, clAlpha: 0, cl0: 0, clMax: 1, alphaStall: rad(90), stallWidth: rad(10),
      cd0: 0.035, oswald: 0.7, control: 'none', controlSign: 0, controlCl: 0, controlCd: 0,
      propwash: 0, dihedral: 0, crossflow: 1.15,
    },
    {
      id: 'tailboom', kind: 'body', area: side * 0.55, span: 0, arm: [-length * 0.34 - cgOffset, 0, 0],
      incidence: 0, clAlpha: 0, cl0: 0, clMax: 1, alphaStall: rad(90), stallWidth: rad(10),
      cd0: 0.045, oswald: 0.7, control: 'none', controlSign: 0, controlCl: 0, controlCd: 0,
      propwash: 0.1, dihedral: 0, crossflow: 1.2,
    },
  ]
}

function prop(o: Partial<PropSpec> & { staticThrust: number }): PropSpec {
  return {
    kind: 'prop', diameter: 0.28, pitch: 0.15, maxRpm: 11000, idleRpm: 1400,
    spoolTime: 0.18, rotation: 1, inertia: 0.0006, slipstream: 1.35, pFactor: 0.55,
    ...o,
  }
}

function wheel(id: string, position: Vec3, o: Partial<GearPoint> = {}): GearPoint {
  return {
    id, kind: 'wheel', position, radius: 0.03, stiffness: 2600, damping: 55,
    steering: 0, brake: 0, grip: 0.85, rollingResistance: 0.022, retractChannel: -1, ...o,
  }
}

const defaultAssists = { autoLevel: 0.35, bankLimit: 0, stallProtection: true, windEffects: true, rateScale: 1 }
const acroAssists = { autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: true, rateScale: 1.25 }

export const aircraftCatalog: AircraftSpec[] = [
  {
    id: 'trainer1500',
    name: 'Trainer 1500',
    family: 'fixed',
    category: 'Yüksek kanat eğitim uçağı',
    summary: '1.5 m açıklık, 2.4 kg. Kendiliğinden toparlayan klasik ilk uçak: yavaş, affedici, pist kalkışı ve devriye için.',
    skills: ['Pist kalkışı', 'Devriye turu', 'Yaklaşma ve iniş', 'Stall toparlama'],
    mass: 2.4, inertia: [0.10, 0.13, 0.21], wingArea: 0.375, span: 1.5, chord: 0.25,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.375, span: 1.5, arm: [-0.02, 0.36, -0.05], dihedral: rad(3.5), incidence: rad(2.5), controlCl: 0.39 }),
      tailPlane({ id: 'htail', area: 0.075, span: 0.52, arm: [-0.62, 0, -0.02], controlCl: 0.45 }),
      fin({ id: 'fin', area: 0.035, span: 0.2, arm: [-0.63, 0, -0.1], controlCl: 0.32 }),
      ...bodyParts(1.15, 0.075),
    ],
    prop: prop({ staticThrust: 21.5, diameter: 0.28, pitch: 0.152, maxRpm: 11000 }),
    gear: [
      wheel('nose', [0.3, 0, 0.17], { steering: 0.5, radius: 0.025, stiffness: 2200 }),
      wheel('main-left', [-0.04, -0.17, 0.18], { brake: 0.55 }),
      wheel('main-right', [-0.04, 0.17, 0.18], { brake: 0.55 }),
      { ...wheel('tip-left', [-0.02, -0.74, -0.02], { kind: 'tip', radius: 0.01, stiffness: 9000, grip: 0.4 }) },
      { ...wheel('tip-right', [-0.02, 0.74, -0.02], { kind: 'tip', radius: 0.01, stiffness: 9000, grip: 0.4 }) },
    ],
    visual: {
      layout: 'high-wing', fuselageLength: 1.15, fuselageRadius: 0.075, noseLength: 0.3, tailLength: 0.65,
      wingZ: -0.11, wingY: -0.11, dihedral: 3.5, sweep: 0, taper: 0.95, tailSpan: 0.52,
      tailType: 'conventional', canopy: 'greenhouse', color: '#e8e4d9', accent: '#c8452f', trim: '#22333d',
      propBlades: 2, gearStyle: 'tricycle',
    },
    envelope: { cruise: 17, stall: 9.1, maxSpeed: 32, climb: 6.5, glideRatio: 9 },
    assists: defaultAssists,
    tuning: { expo: 0.25, dualRate: 0.8, throttleCurve: 'linear' },
  },
  {
    id: 'cub800',
    name: 'Park Cub 800',
    family: 'fixed',
    category: 'Yavaş uçan park modeli',
    summary: '80 cm, 420 g. Çok düşük kanat yüklemesi; bahçede ve salonda ilk kol hareketlerini öğrenmek için.',
    skills: ['Gaz yönetimi', 'Yumuşak iniş', 'Dar alan dönüşü'],
    mass: 0.42, inertia: [0.012, 0.016, 0.026], wingArea: 0.128, span: 0.8, chord: 0.16,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.128, span: 0.8, arm: [-0.012, 0.19, -0.035], cl0: 0.35, clMax: 1.4, clAlpha: 4.4, dihedral: rad(5), cd0: 0.022, controlCl: 0.42 }),
      tailPlane({ id: 'htail', area: 0.026, span: 0.3, arm: [-0.36, 0, -0.01], controlCl: 0.6 }),
      fin({ id: 'fin', area: 0.013, span: 0.13, arm: [-0.37, 0, -0.06], controlCl: 0.45 }),
      ...bodyParts(0.66, 0.045),
    ],
    prop: prop({ staticThrust: 4.6, diameter: 0.2, pitch: 0.1, maxRpm: 9500, inertia: 0.00018, spoolTime: 0.12 }),
    gear: [
      wheel('main-left', [0.05, -0.11, 0.11], { radius: 0.022, stiffness: 700, damping: 12, brake: 0.2 }),
      wheel('main-right', [0.05, 0.11, 0.11], { radius: 0.022, stiffness: 700, damping: 12, brake: 0.2 }),
      wheel('tail', [-0.34, 0, 0.075], { radius: 0.012, stiffness: 900, damping: 10, steering: 0.55 }),
    ],
    visual: {
      layout: 'high-wing', fuselageLength: 0.66, fuselageRadius: 0.045, noseLength: 0.16, tailLength: 0.38,
      wingZ: -0.06, wingY: -0.07, dihedral: 5, sweep: 0, taper: 1, tailSpan: 0.3,
      tailType: 'conventional', canopy: 'greenhouse', color: '#f2c94c', accent: '#2b3a42', trim: '#1d2a30',
      propBlades: 2, gearStyle: 'taildragger',
    },
    envelope: { cruise: 9.5, stall: 5.4, maxSpeed: 18, climb: 3.5, glideRatio: 8 },
    assists: { ...defaultAssists, autoLevel: 0.5 },
    tuning: { expo: 0.35, dualRate: 0.7, throttleCurve: 'linear' },
  },
  {
    id: 'extra330',
    name: 'Extra 330SC 3D',
    family: 'fixed',
    category: 'Akrobatik 3D model',
    summary: '1.05 m, 1.5 kg, itki/ağırlık 2:1. %50 chord yüzeyler: hover, harrier, knife edge, blender.',
    skills: ['Hover / torque roll', 'Knife edge', 'Roll ve loop', 'Spin toparlama'],
    mass: 1.5, inertia: [0.028, 0.05, 0.072], wingArea: 0.29, span: 1.05, chord: 0.28,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.29, span: 1.05, arm: [-0.005, 0.25, 0], cl0: 0, clMax: 1.15, clAlpha: 3.9, alphaStall: rad(15), controlCl: 0.62, controlCd: 0.11, dihedral: 0, incidence: 0, propwash: 0.55 }),
      tailPlane({ id: 'htail', area: 0.062, span: 0.44, arm: [-0.5, 0, 0], controlCl: 0.95, propwash: 0.8, clAlpha: 3.5, incidence: rad(-2.8) }),
      fin({ id: 'fin', area: 0.04, span: 0.24, arm: [-0.52, 0, -0.06], controlCl: 0.7, propwash: 0.85 }),
      ...bodyParts(1.0, 0.07),
    ],
    prop: prop({ staticThrust: 30, diameter: 0.33, pitch: 0.15, maxRpm: 9200, inertia: 0.0011, slipstream: 1.7, pFactor: 0.8, spoolTime: 0.12 }),
    gear: [
      wheel('main-left', [0.06, -0.14, 0.13], { stiffness: 1600, damping: 26, radius: 0.025 }),
      wheel('main-right', [0.06, 0.14, 0.13], { stiffness: 1600, damping: 26, radius: 0.025 }),
      wheel('tail', [-0.48, 0, 0.07], { radius: 0.012, stiffness: 1400, damping: 14, steering: 0.6 }),
      { ...wheel('tip-left', [0, -0.52, 0], { kind: 'tip', radius: 0.008, stiffness: 8000, grip: 0.35 }) },
      { ...wheel('tip-right', [0, 0.52, 0], { kind: 'tip', radius: 0.008, stiffness: 8000, grip: 0.35 }) },
    ],
    visual: {
      layout: 'low-wing', fuselageLength: 1.0, fuselageRadius: 0.07, noseLength: 0.24, tailLength: 0.55,
      wingZ: 0.0, wingY: 0.045, dihedral: 0, sweep: 2, taper: 0.62, tailSpan: 0.44,
      tailType: 'conventional', canopy: 'bubble', color: '#f5f2ea', accent: '#d0342c', trim: '#1b2b3a',
      propBlades: 2, gearStyle: 'taildragger', smoke: true,
    },
    envelope: { cruise: 22, stall: 9.8, maxSpeed: 45, climb: 18, glideRatio: 7 },
    assists: acroAssists,
    tuning: { expo: 0.4, dualRate: 1.15, throttleCurve: 'linear' },
  },
  {
    id: 'warbird1400',
    name: 'T-28 Warbird 1400',
    family: 'fixed',
    category: 'Ölçek savaş uçağı',
    summary: '1.4 m, 3.2 kg, iniş takımı ve flap. Daha yüksek kanat yükü: hız ve yaklaşma disiplini öğretir.',
    skills: ['Flap kullanımı', 'Retract', 'Hızlı yaklaşma', 'Yan rüzgâr inişi'],
    mass: 3.2, inertia: [0.13, 0.17, 0.28], wingArea: 0.36, span: 1.4, chord: 0.26,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.36, span: 1.4, arm: [-0.02, 0.34, 0.02], cl0: 0.22, clMax: 1.3, dihedral: rad(4.5), controlCl: 0.34, propwash: 0.3 }),
      {
        id: 'flap-left', kind: 'wing', area: 0.045, span: 0.3, arm: [-0.09, -0.24, 0.02], incidence: rad(2),
        clAlpha: 4.0, cl0: 0.2, clMax: 1.5, alphaStall: rad(14), stallWidth: rad(4), cd0: 0.02, oswald: 0.7,
        control: 'flap', controlSign: 1, controlCl: 0.75, controlCd: 0.16, propwash: 0.3, dihedral: rad(-4.5),
      },
      {
        id: 'flap-right', kind: 'wing', area: 0.045, span: 0.3, arm: [-0.09, 0.24, 0.02], incidence: rad(2),
        clAlpha: 4.0, cl0: 0.2, clMax: 1.5, alphaStall: rad(14), stallWidth: rad(4), cd0: 0.02, oswald: 0.7,
        control: 'flap', controlSign: 1, controlCl: 0.75, controlCd: 0.16, propwash: 0.3, dihedral: rad(4.5),
      },
      tailPlane({ id: 'htail', area: 0.07, span: 0.5, arm: [-0.6, 0, -0.02], controlCl: 0.45 }),
      fin({ id: 'fin', area: 0.038, span: 0.22, arm: [-0.61, 0, -0.11] }),
      ...bodyParts(1.2, 0.09),
    ],
    prop: prop({ staticThrust: 34, diameter: 0.33, pitch: 0.2, maxRpm: 9800, inertia: 0.0013, pFactor: 0.7 }),
    gear: [
      wheel('nose', [0.34, 0, 0.2], { steering: 0.45, radius: 0.028, stiffness: 3000, retractChannel: 0 }),
      wheel('main-left', [-0.05, -0.2, 0.21], { brake: 0.6, stiffness: 3400, radius: 0.033, retractChannel: 0 }),
      wheel('main-right', [-0.05, 0.2, 0.21], { brake: 0.6, stiffness: 3400, radius: 0.033, retractChannel: 0 }),
      { ...wheel('tip-left', [-0.03, -0.69, 0], { kind: 'tip', radius: 0.01, stiffness: 11000, grip: 0.4 }) },
      { ...wheel('tip-right', [-0.03, 0.69, 0], { kind: 'tip', radius: 0.01, stiffness: 11000, grip: 0.4 }) },
    ],
    visual: {
      layout: 'low-wing', fuselageLength: 1.2, fuselageRadius: 0.09, noseLength: 0.32, tailLength: 0.66,
      wingZ: 0.02, wingY: 0.06, dihedral: 4.5, sweep: 3, taper: 0.7, tailSpan: 0.5,
      tailType: 'conventional', canopy: 'bubble', color: '#b9c0c4', accent: '#f2b134', trim: '#26313a',
      propBlades: 3, gearStyle: 'tricycle',
    },
    envelope: { cruise: 23, stall: 11.6, maxSpeed: 42, climb: 9, glideRatio: 8.5 },
    assists: { ...defaultAssists, autoLevel: 0.2 },
    tuning: { expo: 0.3, dualRate: 0.85, throttleCurve: 'linear' },
  },
  {
    id: 'edf90',
    name: 'Viper EDF 90',
    family: 'fixed',
    category: 'Elektrikli fanlı jet',
    summary: '90 mm fan, 2.3 kg, 4 kg itki. Yüksek hız, geniş dönüş yarıçapı, enerji yönetimi.',
    skills: ['Enerji yönetimi', 'Geniş dönüş', 'Hızlı yaklaşma', 'Go-around'],
    mass: 2.3, inertia: [0.055, 0.11, 0.15], wingArea: 0.19, span: 0.95, chord: 0.22,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.19, span: 0.95, arm: [-0.03, 0.23, 0.01], cl0: 0.08, clMax: 0.95, clAlpha: 3.6, alphaStall: rad(12), cd0: 0.02, controlCl: 0.2, dihedral: rad(1), incidence: rad(1), propwash: 0.05 }),
      tailPlane({ id: 'htail', area: 0.042, span: 0.36, arm: [-0.52, 0, -0.03], controlCl: 0.4, propwash: 0.05 }),
      fin({ id: 'fin', area: 0.026, span: 0.17, arm: [-0.53, 0, -0.09], propwash: 0.05 }),
      ...bodyParts(1.05, 0.075),
    ],
    prop: prop({ kind: 'edf', staticThrust: 40, diameter: 0.09, pitch: 0.14, maxRpm: 32000, idleRpm: 4000, inertia: 0.0002, slipstream: 0.15, pFactor: 0, spoolTime: 0.35, rotation: 1 }),
    gear: [
      wheel('nose', [0.3, 0, 0.13], { steering: 0.35, radius: 0.02, stiffness: 2400, retractChannel: 0 }),
      wheel('main-left', [-0.06, -0.15, 0.14], { brake: 0.5, stiffness: 2800, radius: 0.024, retractChannel: 0 }),
      wheel('main-right', [-0.06, 0.15, 0.14], { brake: 0.5, stiffness: 2800, radius: 0.024, retractChannel: 0 }),
      { ...wheel('tip-left', [-0.05, -0.47, 0], { kind: 'tip', radius: 0.008, stiffness: 9000, grip: 0.35 }) },
      { ...wheel('tip-right', [-0.05, 0.47, 0], { kind: 'tip', radius: 0.008, stiffness: 9000, grip: 0.35 }) },
    ],
    visual: {
      layout: 'mid-wing', fuselageLength: 1.05, fuselageRadius: 0.075, noseLength: 0.34, tailLength: 0.55,
      wingZ: -0.02, wingY: 0.02, dihedral: 1, sweep: 22, taper: 0.45, tailSpan: 0.36,
      tailType: 't-tail', canopy: 'bubble', color: '#dfe4e6', accent: '#1f6feb', trim: '#141c24',
      propBlades: 0, gearStyle: 'tricycle',
    },
    envelope: { cruise: 35, stall: 14.7, maxSpeed: 62, climb: 20, glideRatio: 7 },
    assists: { ...defaultAssists, autoLevel: 0.25, bankLimit: 0 },
    tuning: { expo: 0.35, dualRate: 0.75, throttleCurve: 'linear' },
  },
  {
    id: 'glider2000',
    name: 'Thermal Glider 2000',
    family: 'fixed',
    category: 'Motorlu planör',
    summary: '2 m açıklık, 1.3 kg, yüksek en-boy oranı. Termal, süzülüş oranı ve enerji inişi.',
    skills: ['Termal arama', 'Süzülüş planlaması', 'Spoiler ile iniş', 'Rüzgâr gradyanı'],
    mass: 1.3, inertia: [0.075, 0.06, 0.13], wingArea: 0.36, span: 2.0, chord: 0.18,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.36, span: 2.0, arm: [-0.01, 0.48, -0.03], cl0: 0.35, clMax: 1.35, clAlpha: 5.2, alphaStall: rad(12), cd0: 0.011, oswald: 0.92, controlCl: 0.3, dihedral: rad(4), propwash: 0.1 }),
      tailPlane({ id: 'htail', area: 0.045, span: 0.42, arm: [-0.72, 0, -0.14], controlCl: 0.5, propwash: 0.1 }),
      fin({ id: 'fin', area: 0.022, span: 0.18, arm: [-0.73, 0, -0.2], propwash: 0.1 }),
      ...bodyParts(1.1, 0.05),
    ],
    prop: prop({ staticThrust: 6.5, diameter: 0.23, pitch: 0.13, maxRpm: 9000, inertia: 0.0003, slipstream: 0.7, pFactor: 0.3 }),
    gear: [
      wheel('main', [0.02, 0, 0.1], { radius: 0.025, stiffness: 1500, damping: 24, brake: 0.3 }),
      wheel('outrigger-left', [0.0, -0.42, 0.06], { radius: 0.012, stiffness: 900, damping: 12, grip: 0.5, rollingResistance: 0.03 }),
      wheel('outrigger-right', [0.0, 0.42, 0.06], { radius: 0.012, stiffness: 900, damping: 12, grip: 0.5, rollingResistance: 0.03 }),
      wheel('tail', [-0.68, 0, 0.05], { radius: 0.01, stiffness: 1200, damping: 12, steering: 0.3 }),
      { ...wheel('tip-left', [-0.01, -0.99, -0.05], { kind: 'tip', radius: 0.008, stiffness: 7000, grip: 0.3 }) },
      { ...wheel('tip-right', [-0.01, 0.99, -0.05], { kind: 'tip', radius: 0.008, stiffness: 7000, grip: 0.3 }) },
    ],
    visual: {
      layout: 'high-wing', fuselageLength: 1.1, fuselageRadius: 0.05, noseLength: 0.24, tailLength: 0.76,
      wingZ: -0.05, wingY: -0.08, dihedral: 4, sweep: 0, taper: 0.55, tailSpan: 0.42,
      tailType: 't-tail', canopy: 'bubble', color: '#f7f7f2', accent: '#2ea36f', trim: '#1b2b33',
      propBlades: 2, gearStyle: 'taildragger',
    },
    envelope: { cruise: 12, stall: 6.9, maxSpeed: 30, climb: 3, glideRatio: 20 },
    assists: { ...defaultAssists, autoLevel: 0.3 },
    tuning: { expo: 0.3, dualRate: 0.75, throttleCurve: 'linear' },
  },
  {
    id: 'wing1000',
    name: 'Zephyr Flying Wing',
    family: 'fixed',
    category: 'Uçan kanat',
    summary: '1 m delta kanat, 900 g, elevon karışımı. Dümen yok: yaw sürükleme ve sweep ile.',
    skills: ['Elevon karışımı', 'Kanat ucu stall farkındalığı', 'FPV görüşü'],
    mass: 0.9, inertia: [0.018, 0.03, 0.045], wingArea: 0.22, span: 1.0, chord: 0.26,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.22, span: 1.0, arm: [-0.02, 0.24, 0], cl0: 0.06, clMax: 1.0, clAlpha: 3.5, alphaStall: rad(14), cd0: 0.017, control: 'elevon', controlCl: 0.35, controlCd: 0.08, dihedral: rad(1.5), incidence: rad(-1), propwash: 0.2 }),
      fin({ id: 'winglet-left', area: 0.008, span: 0.09, arm: [-0.16, -0.49, -0.03], controlCl: 0.4, propwash: 0 }),
      fin({ id: 'winglet-right', area: 0.008, span: 0.09, arm: [-0.16, 0.49, -0.03], controlCl: 0.4, propwash: 0 }),
      ...bodyParts(0.55, 0.05),
    ],
    prop: prop({ staticThrust: 11, diameter: 0.15, pitch: 0.15, maxRpm: 16000, inertia: 0.00015, slipstream: 0.8, spoolTime: 0.1, rotation: -1 }),
    gear: [
      { ...wheel('belly', [0, 0, 0.05], { kind: 'belly', radius: 0.015, stiffness: 2600, damping: 40, grip: 0.35, rollingResistance: 0.06 }) },
      { ...wheel('tip-left', [-0.1, -0.49, 0], { kind: 'tip', radius: 0.01, stiffness: 6000, grip: 0.35 }) },
      { ...wheel('tip-right', [-0.1, 0.49, 0], { kind: 'tip', radius: 0.01, stiffness: 6000, grip: 0.35 }) },
    ],
    visual: {
      layout: 'flying-wing', fuselageLength: 0.55, fuselageRadius: 0.05, noseLength: 0.2, tailLength: 0.3,
      wingZ: 0, wingY: 0, dihedral: 1.5, sweep: 26, taper: 0.35, tailSpan: 0,
      tailType: 'none', canopy: 'camera', color: '#2f3b44', accent: '#f26b3a', trim: '#11181d',
      propBlades: 2, gearStyle: 'none',
    },
    envelope: { cruise: 18, stall: 8.6, maxSpeed: 38, climb: 10, glideRatio: 10 },
    assists: { ...defaultAssists, autoLevel: 0.2 },
    tuning: { expo: 0.35, dualRate: 0.9, throttleCurve: 'linear' },
  },
  {
    id: 'float1200',
    name: 'Seaplane 1200',
    family: 'fixed',
    category: 'Yüzdürmeli deniz uçağı',
    summary: '1.2 m, 1.9 kg, çift yüzdürme. Sudan kalkış, su direnci ve step tekniği.',
    skills: ['Sudan kalkış', 'Su taksi', 'Yüzey rüzgârı'],
    mass: 1.9, inertia: [0.07, 0.09, 0.15], wingArea: 0.28, span: 1.2, chord: 0.235,
    surfaces: [
      ...wingPair({ id: 'wing', area: 0.28, span: 1.2, arm: [-0.02, 0.29, -0.12], cl0: 0.3, clMax: 1.3, dihedral: rad(4), propwash: 0.35, controlCl: 0.4 }),
      tailPlane({ id: 'htail', area: 0.055, span: 0.44, arm: [-0.55, 0, -0.06] }),
      fin({ id: 'fin', area: 0.03, span: 0.19, arm: [-0.56, 0, -0.13] }),
      ...bodyParts(1.0, 0.07),
    ],
    prop: prop({ staticThrust: 19, diameter: 0.28, pitch: 0.15, maxRpm: 10500 }),
    gear: [
      { ...wheel('float-left', [0.02, -0.17, 0.24], { kind: 'float', radius: 0.04, stiffness: 3200, damping: 90, grip: 0.12, rollingResistance: 0.09 }) },
      { ...wheel('float-right', [0.02, 0.17, 0.24], { kind: 'float', radius: 0.04, stiffness: 3200, damping: 90, grip: 0.12, rollingResistance: 0.09 }) },
      { ...wheel('float-tail', [-0.4, 0, 0.2], { kind: 'float', radius: 0.02, stiffness: 1800, damping: 50, grip: 0.2, rollingResistance: 0.1, steering: 0.4 }) },
      { ...wheel('tip-left', [-0.02, -0.59, -0.1], { kind: 'tip', radius: 0.01, stiffness: 8000, grip: 0.4 }) },
      { ...wheel('tip-right', [-0.02, 0.59, -0.1], { kind: 'tip', radius: 0.01, stiffness: 8000, grip: 0.4 }) },
    ],
    visual: {
      layout: 'high-wing', fuselageLength: 1.0, fuselageRadius: 0.07, noseLength: 0.26, tailLength: 0.58,
      wingZ: -0.1, wingY: -0.12, dihedral: 4, sweep: 0, taper: 0.9, tailSpan: 0.44,
      tailType: 'conventional', canopy: 'greenhouse', color: '#f0e9d2', accent: '#1f7a8c', trim: '#22333d',
      propBlades: 2, gearStyle: 'skids', floats: true,
    },
    envelope: { cruise: 16, stall: 9.4, maxSpeed: 30, climb: 6, glideRatio: 8 },
    assists: defaultAssists,
    tuning: { expo: 0.25, dualRate: 0.8, throttleCurve: 'linear' },
  },
  {
    id: 'quad5',
    name: 'Apex 5" Racer',
    family: 'multirotor',
    category: 'Yarış drone (acro)',
    summary: '5 inç, 620 g, itki/ağırlık 5:1. Acro ve angle kipleri, gerçek hız PID zinciri.',
    skills: ['Acro hover', 'Hızlı dönüş', 'Split-S', 'Kapı geçişi'],
    mass: 0.62, inertia: [0.0035, 0.0035, 0.0062], wingArea: 0, span: 0.22, chord: 0.05,
    surfaces: [
      {
        id: 'frame', kind: 'body', area: 0.012, span: 0, arm: [0, 0, 0], incidence: 0, clAlpha: 0, cl0: 0, clMax: 1,
        alphaStall: rad(90), stallWidth: rad(10), cd0: 0.55, oswald: 0.7, control: 'none', controlSign: 0,
        controlCl: 0, controlCd: 0, propwash: 0, dihedral: 0, crossflow: 1.2,
      },
    ],
    prop: prop({ kind: 'none', staticThrust: 0 }),
    rotor: {
      kind: 'quad', motors: 4, motorThrust: 8.2, motorTime: 0.045, motorTorque: 0.028, armLength: 0.11,
    },
    gear: [
      { ...wheel('leg-fl', [0.09, -0.09, 0.045], { kind: 'skid', radius: 0.008, stiffness: 1400, damping: 16, grip: 0.7, rollingResistance: 0.3 }) },
      { ...wheel('leg-fr', [0.09, 0.09, 0.045], { kind: 'skid', radius: 0.008, stiffness: 1400, damping: 16, grip: 0.7, rollingResistance: 0.3 }) },
      { ...wheel('leg-bl', [-0.09, -0.09, 0.045], { kind: 'skid', radius: 0.008, stiffness: 1400, damping: 16, grip: 0.7, rollingResistance: 0.3 }) },
      { ...wheel('leg-br', [-0.09, 0.09, 0.045], { kind: 'skid', radius: 0.008, stiffness: 1400, damping: 16, grip: 0.7, rollingResistance: 0.3 }) },
    ],
    visual: {
      layout: 'quad', fuselageLength: 0.16, fuselageRadius: 0.035, noseLength: 0.06, tailLength: 0.06,
      wingZ: 0, wingY: 0, dihedral: 0, sweep: 0, taper: 1, tailSpan: 0,
      tailType: 'none', canopy: 'camera', color: '#20262b', accent: '#f25c2a', trim: '#8ce99a',
      propBlades: 3, gearStyle: 'legs',
    },
    envelope: { cruise: 22, stall: 0, maxSpeed: 40, climb: 18, glideRatio: 1, hoverThrottle: 0.44 },
    assists: { autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: true, rateScale: 1 },
    tuning: { expo: 0.3, dualRate: 1, throttleCurve: 'quad' },
  },
  {
    id: 'cinedrone',
    name: 'Cinelifter GPS',
    family: 'multirotor',
    category: 'Kamera drone (GPS/loiter)',
    summary: '1.25 kg, GPS loiter, irtifa tutma, eve dönüş. Yumuşak sinematik hareket ve konum hassasiyeti.',
    skills: ['Loiter hover', 'İrtifa tutma', 'Nokta inişi', 'RTH'],
    mass: 1.25, inertia: [0.014, 0.014, 0.024], wingArea: 0, span: 0.45, chord: 0.08,
    surfaces: [
      {
        id: 'frame', kind: 'body', area: 0.03, span: 0, arm: [0, 0, 0], incidence: 0, clAlpha: 0, cl0: 0, clMax: 1,
        alphaStall: rad(90), stallWidth: rad(10), cd0: 0.5, oswald: 0.7, control: 'none', controlSign: 0,
        controlCl: 0, controlCd: 0, propwash: 0, dihedral: 0, crossflow: 1.15,
      },
    ],
    prop: prop({ kind: 'none', staticThrust: 0 }),
    rotor: { kind: 'quad', motors: 4, motorThrust: 7.4, motorTime: 0.12, motorTorque: 0.035, armLength: 0.22 },
    gear: [
      { ...wheel('leg-fl', [0.13, -0.15, 0.1], { kind: 'skid', radius: 0.01, stiffness: 2000, damping: 30, grip: 0.8, rollingResistance: 0.35 }) },
      { ...wheel('leg-fr', [0.13, 0.15, 0.1], { kind: 'skid', radius: 0.01, stiffness: 2000, damping: 30, grip: 0.8, rollingResistance: 0.35 }) },
      { ...wheel('leg-bl', [-0.13, -0.15, 0.1], { kind: 'skid', radius: 0.01, stiffness: 2000, damping: 30, grip: 0.8, rollingResistance: 0.35 }) },
      { ...wheel('leg-br', [-0.13, 0.15, 0.1], { kind: 'skid', radius: 0.01, stiffness: 2000, damping: 30, grip: 0.8, rollingResistance: 0.35 }) },
    ],
    visual: {
      layout: 'camera-quad', fuselageLength: 0.26, fuselageRadius: 0.06, noseLength: 0.1, tailLength: 0.1,
      wingZ: 0, wingY: 0, dihedral: 0, sweep: 0, taper: 1, tailSpan: 0,
      tailType: 'none', canopy: 'camera', color: '#d9dde0', accent: '#3b4a55', trim: '#f2a33c',
      propBlades: 2, gearStyle: 'legs',
    },
    envelope: { cruise: 12, stall: 0, maxSpeed: 20, climb: 6, glideRatio: 1, hoverThrottle: 0.55 },
    assists: { autoLevel: 1, bankLimit: rad(25), stallProtection: false, windEffects: true, rateScale: 0.7 },
    tuning: { expo: 0.4, dualRate: 0.7, throttleCurve: 'quad' },
  },
  {
    id: 'heli500',
    name: 'Raptor 500 Heli',
    family: 'heli',
    category: 'Collective pitch helikopter',
    summary: '500 sınıf, 1.9 kg, 2200 rpm kafa hızı. Collective, cyclic, kuyruk gyro ve otorotasyon.',
    skills: ['Collective hover', 'Kuyruk kontrolü', 'İleri uçuş geçişi', 'Otorotasyon inişi'],
    mass: 1.9, inertia: [0.035, 0.055, 0.06], wingArea: 0, span: 1.1, chord: 0.05,
    surfaces: [
      {
        id: 'fuselage', kind: 'body', area: 0.05, span: 0, arm: [-0.05, 0, 0], incidence: 0, clAlpha: 0, cl0: 0, clMax: 1,
        alphaStall: rad(90), stallWidth: rad(10), cd0: 0.6, oswald: 0.7, control: 'none', controlSign: 0,
        controlCl: 0, controlCd: 0, propwash: 0, dihedral: 0, crossflow: 1.2,
      },
      {
        id: 'hstab', kind: 'htail', area: 0.012, span: 0.18, arm: [-0.62, 0, -0.02], incidence: 0,
        clAlpha: 3.2, cl0: 0, clMax: 1, alphaStall: rad(20), stallWidth: rad(5), cd0: 0.02, oswald: 0.7,
        control: 'none', controlSign: 0, controlCl: 0, controlCd: 0, propwash: 0.3, dihedral: 0,
      },
    ],
    prop: prop({ kind: 'none', staticThrust: 0 }),
    rotor: {
      kind: 'heli', discArea: 0.95, radius: 0.55, headSpeed: 2200, solidity: 0.045, bladeLiftSlope: 5.7,
      collectiveMin: rad(-12), collectiveMax: rad(12), cyclicTilt: rad(9), flapTime: 0.09,
      hubStiffness: 95, tailArm: 0.72, tailThrust: 11, gyroGain: 2.6,
    },
    gear: [
      { ...wheel('skid-left', [0, -0.14, 0.2], { kind: 'skid', radius: 0.012, stiffness: 2600, damping: 45, grip: 0.75, rollingResistance: 0.4 }) },
      { ...wheel('skid-right', [0, 0.14, 0.2], { kind: 'skid', radius: 0.012, stiffness: 2600, damping: 45, grip: 0.75, rollingResistance: 0.4 }) },
      { ...wheel('tail-skid', [-0.66, 0, 0.14], { kind: 'skid', radius: 0.01, stiffness: 1800, damping: 25, grip: 0.7, rollingResistance: 0.4 }) },
    ],
    visual: {
      layout: 'heli', fuselageLength: 1.0, fuselageRadius: 0.1, noseLength: 0.22, tailLength: 0.72,
      wingZ: 0, wingY: 0, dihedral: 0, sweep: 0, taper: 1, tailSpan: 0.18,
      tailType: 'none', canopy: 'bubble', color: '#f2f4f2', accent: '#e0452f', trim: '#2a3138',
      propBlades: 2, gearStyle: 'skids',
    },
    envelope: { cruise: 18, stall: 0, maxSpeed: 32, climb: 9, glideRatio: 2, hoverThrottle: 0.42 },
    assists: { autoLevel: 0.4, bankLimit: rad(30), stallProtection: false, windEffects: true, rateScale: 0.9 },
    tuning: { expo: 0.3, dualRate: 0.85, throttleCurve: 'heli' },
  },
]

export const aircraftById = (id: string): AircraftSpec =>
  aircraftCatalog.find(a => a.id === id) ?? aircraftCatalog[0]

export const aircraftIds = aircraftCatalog.map(a => a.id)
export const families = ['fixed', 'multirotor', 'heli'] as const
