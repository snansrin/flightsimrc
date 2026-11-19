import { describe, expect, it } from 'vitest'
import { assessLesson, beginLesson, lessons } from './school'
import { newFlightSimulation } from './sim/bridge'

describe('flight school', () => {
  it('requires continuous time inside the level-flight envelope', () => {
    const lesson = lessons[1]
    const sim = newFlightSimulation('trainer')
    sim.reset({ airborne: lesson.airborne })
    const run = beginLesson(lesson, sim)
    sim.state.airspeed = 16
    assessLesson(run, sim, 4)
    expect(run.hold).toBe(4)
    sim.state.airspeed = 2
    assessLesson(run, sim, 1)
    expect(run.hold).toBe(0)
    sim.state.airspeed = 16
    for (let i = 0; i < 360; i++) assessLesson(run, sim, 1 / 60)
    expect(run.status).toBe('passed')
  })
  it('rejects an approach touching down outside the runway', () => {
    const lesson = lessons[2]
    const sim = newFlightSimulation('trainer')
    sim.reset({ airborne: lesson.airborne })
    const run = beginLesson(lesson, sim)
    sim.state.position = [sim.field.runway.width, .2, 0]
    sim.state.onGround = true
    assessLesson(run, sim, 1 / 60)
    expect(run.status).toBe('failed')
    expect(run.message).toBe('Pist dışında temas.')
  })
  it('cannot pass hover while steadily drifting beyond the practice area', () => {
    const sim = newFlightSimulation('cinedrone')
    const run = beginLesson(lessons[3], sim)
    sim.state.agl = 3
    sim.state.position[0] += 6
    assessLesson(run, sim, 5)
    expect(run.hold).toBe(0)
    sim.state.position[0] = run.start[0]
    assessLesson(run, sim, 5)
    expect(run.status).toBe('passed')
  })
})
