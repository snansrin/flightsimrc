import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FlightDeck } from './FlightDeck'
import { initialFlight } from './flight'
import { fields } from './sim/fields'

describe('flight deck rendering', () => {
  it('renders ADI attitude, HSI course, target navigation and local-only caveat', () => {
    const state = {
      ...initialFlight(),
      position: [40, 22, -100] as [number, number, number],
      velocity: [0, 1, 10] as [number, number, number],
      pitch: .1, roll: -.2,
    }
    const html = renderToStaticMarkup(<FlightDeck flight={state} field={fields[0]} course={0}
      onCourseChange={() => {}} target="runway" onTargetChange={() => {}} />)
    expect(html).toContain('ADI · ATTITUDE')
    expect(html).toContain('HSI · NAVIGATION')
    expect(html).toContain('PİST MERKEZİ')
    expect(html).toContain('DCT')
    expect(html).toContain('Yerel simülasyon navigasyonu')
    expect(html).toContain('aria-label="ADI, yapay ufuk')
    expect(html).toContain('CDI')
  })
})
