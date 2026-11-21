import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FlightDeck, FlightNavigation } from './FlightDeck'
import { initialFlight } from './flight'
import { fields } from './sim/fields'

describe('flight deck rendering', () => {
  it('puts ADI, HSI and airspeed in three circular instruments', () => {
    const state = {
      ...initialFlight(),
      position: [40, 22, -100] as [number, number, number],
      velocity: [0, 1, 10] as [number, number, number],
      pitch: .1, roll: -.2,
    }
    const html = renderToStaticMarkup(<FlightDeck flight={state} field={fields[0]} course={0} target="runway" maxSpeed={40} />)
    expect(html.match(/<svg /g)).toHaveLength(3)
    expect(html.match(/class="instrument-bezel"/g)).toHaveLength(3)
    expect(html).toContain('aria-label="ADI, yapay ufuk')
    expect(html).toContain('aria-label="HSI, baş')
    expect(html).toContain('aria-label="Hava hızı')
    expect(html).not.toContain('<rect')
  })

  it('retains the runway, approach and direct-to navigation controls outside the display', () => {
    const html = renderToStaticMarkup(<FlightNavigation flight={initialFlight()} field={fields[0]} course={90}
      target="approach" onCourseChange={() => {}} onTargetChange={() => {}} />)
    expect(html).toContain('HSI rota · 090°')
    expect(html).toContain('YAKLAŞMA WP')
    expect(html).toContain('DCT')
    expect(html).toContain('Yerel simülasyon navigasyonu')
  })
})
