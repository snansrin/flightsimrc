import type { FlightState } from './flight'
import type { Field } from './sim/fields'
import { formatEta, navigationReadout, wrapHeading, type NavTarget } from './avionics'
import { Instruments } from './scene/Instruments'

type Navigation = { flight: FlightState; field: Field; course: number; target: NavTarget }
const fmt3 = (value: number) => String(wrapHeading(Math.round(value))).padStart(3, '0')

export function FlightDeck({ flight, field, course, target, maxSpeed }: Navigation & { maxSpeed: number }) {
  return <Instruments flight={flight} nav={navigationReadout(flight, field, course, target)} maxSpeed={maxSpeed} />
}

export function FlightNavigation({ flight, field, course, target, onCourseChange, onTargetChange }: Navigation & {
  onCourseChange: (course: number) => void
  onTargetChange: (target: NavTarget) => void
}) {
  const nav = navigationReadout(flight, field, course, target)
  return <details className="flight-navigation">
    <summary>HSI rota · {fmt3(nav.course)}°</summary>
    <div className="flight-navigation-controls">
      {field.runway.length > 0 && <label>Hedef
        <select value={target} onChange={event => onTargetChange(event.target.value as NavTarget)}>
          <option value="runway">Pist merkezi</option>
          <option value="approach">Yaklaşma noktası</option>
        </select>
      </label>}
      <button type="button" title="Rotayı 5° azalt" onClick={() => onCourseChange(wrapHeading(course - 5))}>−5°</button>
      {field.runway.length > 0 && <button type="button" title="Pist doğrultusu" onClick={() => onCourseChange(wrapHeading(field.runway.heading))}>RWY</button>}
      <button type="button" title="Hedefe doğrudan rota" onClick={() => onCourseChange(nav.bearing)}>DCT</button>
      <button type="button" title="Rotayı 5° artır" onClick={() => onCourseChange(wrapHeading(course + 5))}>+5°</button>
    </div>
    <small>{nav.waypoint.label} · {Math.round(nav.distanceMeters)} m · ETA {formatEta(nav.etaSeconds)} · Yerel simülasyon navigasyonu</small>
  </details>
}
