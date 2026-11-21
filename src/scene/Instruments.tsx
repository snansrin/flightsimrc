import { useId } from 'react'
import type { FlightState } from '../flight'
import type { NavigationReadout } from '../avionics'

const toDegrees = 180 / Math.PI
const degrees = (angle: number) => String(Math.round(angle) % 360).padStart(3, '0')
const compassLabels = ['K', '03', '06', 'D', '12', '15', 'G', '21', '24', 'B', '30', '33']
const ticks = Array.from({ length: 36 }, (_, index) => index * 10)
const pitchMarks = [-40, -30, -20, -10, 10, 20, 30, 40]

function Attitude({ pitch, roll }: Pick<FlightState, 'pitch' | 'roll'>) {
  const clip = useId()
  const pitchDegrees = pitch * toDegrees
  const rollDegrees = roll * toDegrees
  return <svg className="flight-instrument" viewBox="0 0 100 100" role="img"
    aria-label={`ADI, yapay ufuk, burun ${Math.round(pitchDegrees)} derece, yatış ${Math.round(rollDegrees)} derece`}>
    <defs><clipPath id={clip}><circle cx="50" cy="50" r="46" /></clipPath></defs>
    <circle className="instrument-face" cx="50" cy="50" r="48" />
    <g clipPath={`url(#${clip})`}>
      <g transform={`rotate(${-rollDegrees} 50 50)`}>
        <g transform={`translate(0 ${pitchDegrees * .95})`}>
          <path d="M-100 -150H200V50H-100Z" fill="#376584" />
          <path d="M-100 50H200V250H-100Z" fill="#704e36" />
          <path d="M-100 50H200" stroke="#ecf5ef" strokeWidth="1.4" />
          {pitchMarks.map(value => <line key={value} x1={value % 20 ? 43 : 39} x2={value % 20 ? 57 : 61}
            y1={50 - value * .95} y2={50 - value * .95} stroke="#e6ece7" strokeOpacity=".83" strokeWidth="1.15" />)}
        </g>
      </g>
      <path d="M23 50h17l4 5m33-5H60l-4 5" fill="none" stroke="#ffe1a3" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="2.2" fill="#ffe1a3" />
      {[-60, -45, -30, 0, 30, 45, 60].map(angle => <path key={angle} d="M50 8v5"
        transform={`rotate(${angle} 50 50)`} stroke="#fff6e3" strokeWidth={angle % 30 ? 1 : 1.75} />)}
      <path d="m50 15-3.3 5h6.6Z" transform={`rotate(${rollDegrees} 50 50)`} fill="#ffe1a3" />
      <text x="50" y="84" className="instrument-label">ADI</text>
    </g>
    <circle className="instrument-bezel" cx="50" cy="50" r="47.5" />
  </svg>
}

function Heading({ nav }: { nav: NavigationReadout }) {
  const { heading, courseRelative, cdi, relativeBearing } = nav
  const deviation = cdi * 7
  return <svg className="flight-instrument" viewBox="0 0 100 100" role="img"
    aria-label={`HSI, baş ${degrees(heading)} derece, rota ${degrees(nav.course)} derece, CDI ${cdi.toFixed(1)} nokta, hedef ${degrees(nav.bearing)} derece`}>
    <circle className="instrument-face" cx="50" cy="50" r="48" />
    <g transform={`rotate(${-heading} 50 50)`}>
      {ticks.map(angle => <path key={angle} d={angle % 30 ? 'M50 11v3' : 'M50 10v6'} stroke="#cbd9df" strokeWidth="1.2"
        transform={`rotate(${angle} 50 50)`} />)}
      {compassLabels.map((label, index) => Math.cos((index * 30 - heading) / toDegrees) >= -.63 && <g key={label} transform={`rotate(${index * 30} 50 50)`}>
        <text className="instrument-compass" x="50" y="24" transform={`rotate(${heading - index * 30} 50 21)`}>{label}</text>
      </g>)}
    </g>
    <path d="m50 28-3 5h6Z" transform={`rotate(${relativeBearing} 50 50)`} fill="#efc763" />
    <g transform={`rotate(${courseRelative} 50 50)`} fill="none" stroke="#83ded8">
      <path d="M50 34v8m-4-4 4-4 4 4m-4 21v8" strokeWidth="2" />
      <path d={`M${50 + deviation} 43v14`} strokeWidth="2.3" />
      <path d="M34 50h2m6 0h2m12 0h2m6 0h2" strokeOpacity=".65" />
    </g>
    <path d="m50 8-3 5h6Z" fill="#ffe1a3" />
    <path d="M50 45v10m-6-5h12m-8 5h4" fill="none" stroke="#ffe1a3" strokeWidth="1.5" />
    <text x="50" y="82" className="instrument-value">{degrees(heading)}°</text>
    <text x="50" y="92" className="instrument-unit">HSI</text>
    <circle className="instrument-bezel" cx="50" cy="50" r="47.5" />
  </svg>
}

function Airspeed({ speed, limit }: { speed: number; limit: number }) {
  const value = Math.max(0, Math.round(speed * 3.6))
  const top = Math.max(60, Math.ceil(limit * 3.6 / 30) * 30)
  const angle = (ratio: number) => -128 + ratio * 256
  return <svg className="flight-instrument" viewBox="0 0 100 100" role="img" aria-label={`Hava hızı ${value} kilometre saat`}>
    <circle className="instrument-face" cx="50" cy="50" r="48" />
    {Array.from({ length: 13 }, (_, index) => <path key={index} d={index % 3 ? 'M50 12v4' : 'M50 10v7'} stroke="#cbd9df"
      strokeWidth={index % 3 ? 1 : 1.6} transform={`rotate(${angle(index / 12)} 50 50)`} />)}
    {[0, 1, 2, 3, 4].map(mark => {
      const radians = angle(mark / 4) / toDegrees
      return <text key={mark} className="instrument-compass" x={50 + 27 * Math.sin(radians)} y={53 - 27 * Math.cos(radians)}>
        {Math.round(top * mark / 4)}
      </text>
    })}
    <path d="M50 16v34" stroke="#ffba83" strokeWidth="2.8" strokeLinecap="round"
      transform={`rotate(${angle(Math.min(1, value / top))} 50 50)`} />
    <circle cx="50" cy="50" r="3.4" fill="#ffba83" />
    <text x="50" y="74" className="instrument-value">{value}</text>
    <text x="50" y="86" className="instrument-unit">km/sa</text>
    <circle className="instrument-bezel" cx="50" cy="50" r="47.5" />
  </svg>
}

export function Instruments({ flight, nav, maxSpeed }: { flight: FlightState; nav: NavigationReadout; maxSpeed: number }) {
  return <div className="flight-instruments" aria-label="Uçuş göstergeleri">
    <Attitude pitch={flight.pitch} roll={flight.roll} />
    <Heading nav={nav} />
    <Airspeed speed={flight.airspeed} limit={maxSpeed} />
  </div>
}
