import type { FlightState } from '../flight'
import type { Field } from '../sim/fields'
import { localWaypoint, type NavTarget } from '../avionics'

const percentage = (distance: number, range: number) => Math.min(97, Math.max(3, 50 + 100 * distance / range))

export function FieldMap({ field, flight, target = 'runway' }: { field: Field; flight: FlightState; target?: NavTarget }) {
  const { runway } = field
  const waypoint = localWaypoint(field, target)
  const x = flight.position[0] - runway.center[0]
  const z = flight.position[2] + runway.center[1]
  const wx = waypoint.x - runway.center[0]
  const wz = waypoint.z + runway.center[1]
  // Scale the tactical map to keep both aircraft and destination visible.
  const range = Math.max(400, Math.ceil(Math.max(Math.abs(x), Math.abs(z), Math.abs(wx), Math.abs(wz)) * 2.4))
  const px = percentage(x, range), py = percentage(-z, range)
  const wpx = percentage(wx, range), wpy = percentage(-wz, range)
  const distance = Math.hypot(flight.position[0] - waypoint.x, flight.position[2] - waypoint.z)
  return <div className="field-map" aria-label={'Yerel uçuş haritası. ' + waypoint.label + ' mesafesi ' + Math.round(distance) + ' metre.'}>
    <span className="map-north">K</span>
    <svg className="field-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line x1={px} y1={py} x2={wpx} y2={wpy} stroke="#63e1cb" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
    </svg>
    <i className="map-runway" style={{ height: runway.length * 100 / range + '%', transform: 'translate(-50%, -50%) rotate(' + runway.heading + 'deg)' }} />
    <i className="map-waypoint" style={{ left: wpx + '%', top: wpy + '%' }} title={waypoint.label} />
    <i className="map-aircraft"
      style={{ left: px + '%', top: py + '%', transform: 'translate(-50%, -50%) rotate(' + flight.yaw + 'rad)' }} />
    <span className="map-scale">{Math.round(range)} m · {target === 'runway' ? 'RWY' : 'APP'}</span>
  </div>
}
