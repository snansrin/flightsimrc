import type { FlightState } from '../flight'
import type { Field } from '../sim/fields'

const mapRange = 320
const percentage = (distance: number) => Math.min(97, Math.max(3, 50 + 100 * distance / mapRange))

export function FieldMap({ field, flight }: { field: Field; flight: FlightState }) {
  const { runway } = field
  const x = flight.position[0] - runway.center[0]
  const z = flight.position[2] + runway.center[1]
  const offMap = Math.max(Math.abs(x), Math.abs(z)) >= mapRange / 2
  const scale = offMap ? (mapRange / 2) / Math.max(Math.abs(x), Math.abs(z)) : 1
  return <div className="field-map" aria-label={`Pist haritası. Pist merkezine uzaklık ${Math.round(Math.hypot(x, z))} metre.`}>
    <span className="map-north">K</span>
    <i className="map-runway" style={{ height: `${runway.length * 100 / mapRange}%`, transform: `translate(-50%, -50%) rotate(${runway.heading}deg)` }} />
    <i className={`map-aircraft${offMap ? ' map-aircraft-outside' : ''}`}
      style={{ left: `${percentage(x * scale)}%`, top: `${percentage(-z * scale)}%`, transform: `translate(-50%, -50%) rotate(${flight.yaw}rad)` }} />
    <span className="map-scale">320 m</span>
  </div>
}
