import type { Simulation, SimulationOptions } from './sim/simulation'
import type { Vec3 } from './sim/math'
import { runwayCoordinates } from './sim/fields'

export const lessons = [
  { id: 'takeoff', name: 'Pistten kalkış', aircraft: 'trainer', instruction: 'Gazı kademeli artır. Pist eksenini koru, hızlanınca burnu hafifçe kaldır ve 8 m tırman.', seconds: 2, timeout: 55 },
  { id: 'level', name: 'Düz ve dengeli uçuş', aircraft: 'trainer', instruction: '45–72 km/sa hızla, 17–33 m irtifada ve 15° altında yatışla 6 saniye uç.', seconds: 6, timeout: 50, airborne: { altitude: 24, airspeed: 16 } },
  { id: 'landing', name: 'Yaklaşma ve iniş', aircraft: 'trainer', instruction: 'Pist çizgisinde kal. Gücü kademeli azalt, palyede burnu hafifçe kaldır ve 2 m/s altında alçalma hızıyla piste teker koy.', seconds: 1, timeout: 60, airborne: { altitude: 10, airspeed: 15, offset: -64 } },
  { id: 'hover', name: 'Hassas hover', aircraft: 'cinedrone', instruction: 'Gazı yavaşça artır. Başlangıç noktasının 5 m çevresinde, 2–5 m yükseklikte 5 saniye havada kal.', seconds: 5, timeout: 60 },
] as const satisfies readonly {
  id: string; name: string; aircraft: string; instruction: string; seconds: number; timeout: number
  airborne?: SimulationOptions['airborne']
}[]

export type Lesson = typeof lessons[number]
export type LessonRun = {
  lesson: Lesson
  start: Vec3
  hold: number
  elapsed: number
  status: 'active' | 'passed' | 'failed'
  previousOnGround: boolean
  previousSink: number
  message: string
}

export function beginLesson(lesson: Lesson, sim: Simulation): LessonRun {
  return {
    lesson, start: [...sim.state.position], hold: 0, elapsed: 0, status: 'active',
    previousOnGround: sim.state.onGround, previousSink: 0, message: '',
  }
}

export function assessLesson(run: LessonRun, sim: Simulation, dt: number): void {
  if (run.status !== 'active') return
  const { state, field, attitude } = sim
  const { lesson } = run
  run.elapsed += dt
  if (state.crashed || run.elapsed >= lesson.timeout) {
    run.status = 'failed'
    run.message = state.crashed ? state.crashReason || 'Araç kaza yaptı.' : 'Ders süresi doldu.'
    return
  }
  const [x, , z] = state.position
  const { runway } = field
  const [lateral, alongTrack] = runwayCoordinates(runway.center, runway.heading, x, z)
  const crossTrack = Math.abs(lateral)
  const wingsLevel = Math.abs(attitude.roll) < Math.PI / 12
  let meetsTarget = false
  switch (lesson.id) {
    case 'takeoff':
      meetsTarget = state.agl >= 8 && !state.onGround && !state.stalled && wingsLevel && crossTrack < 12 && state.climbRate > 0
      run.message = state.agl < 8 ? 'Pist eksenini koruyarak 8 m yüksekliğe çık.' : 'Kanatları dengede tut ve tırmanışı sürdür.'
      break
    case 'level':
      meetsTarget = !state.onGround && !state.stalled && wingsLevel && state.agl >= 17 && state.agl <= 33
        && state.airspeed >= 12.5 && state.airspeed <= 20 && Math.abs(state.climbRate) < 1.8
      run.message = 'Gazla hızı, küçük irtifa dümeni komutlarıyla yüksekliği koru.'
      break
    case 'landing': {
      const onRunway = crossTrack <= runway.width / 2 && Math.abs(alongTrack) <= runway.length / 2
      if (state.onGround && !run.previousOnGround && run.hold === 0) {
        if (!onRunway || !wingsLevel || run.previousSink < -2) {
          run.status = 'failed'
          run.message = !onRunway ? 'Pist dışında temas.' : !wingsLevel ? 'Temasta yatış 15° sınırını aştı.' : 'Temastan önce alçalma hızı 2 m/s sınırını aştı.'
          return
        }
      }
      meetsTarget = state.onGround && onRunway && wingsLevel
      run.message = state.onGround ? 'Pist doğrultusunda yuvarlanmaya devam et.' : 'Pist eksenine hizalan ve alçalma hızını düşür.'
      break
    }
    case 'hover':
      meetsTarget = state.agl >= 2 && state.agl <= 5 && state.groundSpeed < 1.3 && Math.abs(state.climbRate) < .8
        && Math.hypot(x - run.start[0], z - run.start[2]) <= 5
      run.message = 'Küçük komutlarla 2–5 m arasında ve başlangıç noktasına yakın dur.'
      break
  }
  run.previousOnGround = state.onGround
  run.previousSink = state.climbRate
  run.hold = meetsTarget ? run.hold + dt : 0
  if (run.hold + 1e-6 >= lesson.seconds) {
    run.status = 'passed'
    run.message = 'Uçuş hedefi tamamlandı.'
  }
}
