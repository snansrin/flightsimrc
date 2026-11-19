import type { FlightState } from './flight'
import type { Field } from './sim/fields'
import { formatEta, navigationReadout, wrapHeading, type NavTarget } from './avionics'

const degrees = (radians: number) => radians * 180 / Math.PI
const tickMarks = Array.from({ length: 36 }, (_, i) => i * 10)
const pitchMarks = [-30, -20, -10, 10, 20, 30]
const bankMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]
const fmt3 = (value: number) => String(Math.round(wrapHeading(value))).padStart(3, '0').slice(-3)
const courseStep = (heading: number, delta: number) => wrapHeading(heading + delta)

function AttitudeDisplay({ flight }: { flight: FlightState }) {
  const roll = degrees(flight.roll)
  const pitch = Math.max(-85, Math.min(85, degrees(flight.pitch)))
  return <section className="deck-instrument deck-adi" aria-label="ADI, yapay ufuk ve yatış göstergesi">
    <div className="deck-instrument-title"><span>ADI · ATTITUDE</span><span className="deck-online">● LIVE</span></div>
    <svg viewBox="0 0 240 240" role="img" aria-label={'Yatış ' + Math.round(roll) + ' derece, burun ' + Math.round(pitch) + ' derece'}>
      <defs><clipPath id="flightdeck-adi-clip"><circle cx="120" cy="120" r="97" /></clipPath></defs>
      <circle cx="120" cy="120" r="102" fill="#07131d" stroke="#385065" strokeWidth="4" />
      <g clipPath="url(#flightdeck-adi-clip)">
        <g transform={'translate(120 120) rotate(' + (-roll) + ') translate(0 ' + (pitch * 2.2) + ')'}>
          <rect x="-320" y="-380" width="640" height="380" fill="#3e89bc" />
          <rect x="-320" y="0" width="640" height="380" fill="#8d563b" />
          <path d="M-320 0 H320" stroke="#faf2d8" strokeWidth="3" />
          {pitchMarks.map(value => <g key={value} transform={'translate(0 ' + (-value * 2.2) + ')'}>
            <path d={Math.abs(value) % 20 === 0 ? 'M-41 0 H-15 M15 0 H41' : 'M-28 0 H-11 M11 0 H28'} stroke="#f4f5eb" strokeWidth="2" />
            <text x="-48" y="4" fontSize="9" textAnchor="end" fill="#ffffff">{Math.abs(value)}</text>
            <text x="48" y="4" fontSize="9" textAnchor="start" fill="#ffffff">{Math.abs(value)}</text>
          </g>)}
          <path d="M-18 22 H18" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" opacity=".7" />
        </g>
      </g>
      {bankMarks.map(value => <g key={value} transform={'rotate(' + value + ' 120 120)'}>
        <path d={'M120 16 V' + (Math.abs(value) % 30 === 0 ? 27 : 23)} stroke="#e8eef5" strokeWidth="2" />
      </g>)}
      <path d="M120 18 L113 33 H127 Z" fill="#fbf5e5" />
      <path d="M65 121 H96 L106 130 H134 L144 121 H175 M120 119 V140" fill="none" stroke="#ffd476" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="120" cy="120" r="3" fill="#ffeeb4" />
      <circle cx="120" cy="120" r="97" fill="none" stroke="#e2e8e4" strokeWidth="1.8" />
    </svg>
    <div className="deck-adi-readouts">
      <div><span>BANK</span><strong>{Math.round(roll)}°</strong></div>
      <div><span>PITCH</span><strong>{Math.round(pitch)}°</strong></div>
      <div><span>V/S</span><strong>{Math.round(flight.velocity[1] * 60)} <small>m/dk</small></strong></div>
    </div>
  </section>
}

function CourseDisplay({ nav }: { nav: ReturnType<typeof navigationReadout> }) {
  return <svg viewBox="0 0 260 260" role="img" aria-label={'HSI, baş ' + fmt3(nav.heading) + ', rota ' + fmt3(nav.course) + ', CDI ' + nav.cdi.toFixed(1) + ' nokta, hedef kerterizi ' + fmt3(nav.bearing)}>
    <circle cx="130" cy="130" r="117" fill="#0b1924" stroke="#344d61" strokeWidth="4" />
    <g transform={'rotate(' + (-nav.heading) + ' 130 130)'}>
      <circle cx="130" cy="130" r="104" fill="none" stroke="#7594a2" strokeWidth="2" />
      {tickMarks.map(value => <g key={value} transform={'rotate(' + value + ' 130 130)'}>
        <path d={'M130 25 V' + (value % 30 === 0 ? 39 : 32)} stroke={value % 30 === 0 ? '#ebf2f1' : '#86a5b4'} strokeWidth={value % 30 === 0 ? 2 : 1} />
        {value % 30 === 0 && <text x="130" y="52" fill="#f1f5f5" fontSize="12" fontWeight="700" textAnchor="middle" transform={'rotate(' + (-value + nav.heading) + ' 130 49)'}>
          {value === 0 ? 'N' : value === 90 ? 'E' : value === 180 ? 'S' : value === 270 ? 'W' : String(value / 10)}
        </text>}
      </g>)}
    </g>
    <g transform={'rotate(' + nav.relativeBearing + ' 130 130)'}>
      <path d="M130 172 V64" stroke="#efc763" strokeWidth="3" strokeLinecap="round" />
      <path d="M130 57 L121 73 L139 73 Z" fill="#efc763" />
    </g>
    <g transform={'rotate(' + nav.courseRelative + ' 130 130)'}>
      <path d="M130 52 V95 M130 166 V204" stroke="#62f0d4" strokeWidth="5" strokeLinecap="round" />
      <path d="M130 43 L122 59 L138 59 Z" fill="#62f0d4" />
      {[-2, -1, 1, 2].map(dot => <circle key={dot} cx={130 + dot * 14} cy="130" r="3" stroke="#b8cbd4" fill="none" />)}
      <rect x={126 + nav.cdi * 14} y="97" width="8" height="66" rx="3" fill="#62f0d4" />
    </g>
    <path d="M130 115 L123 139 H137 Z" fill="#fcf6ee" stroke="#10212e" strokeWidth="1" />
    <rect x="98" y="0" width="64" height="23" rx="5" fill="#162f3e" stroke="#61889b" />
    <text x="130" y="16" fill="#f8f4e8" fontSize="15" fontWeight="800" textAnchor="middle">{fmt3(nav.heading)}°</text>
  </svg>
}

export function FlightDeck({ flight, field, course, onCourseChange, target, onTargetChange }: {
  flight: FlightState
  field: Field
  course: number
  onCourseChange: (course: number) => void
  target: NavTarget
  onTargetChange: (target: NavTarget) => void
}) {
  const nav = navigationReadout(flight, field, course, target)
  return <div className="flight-deck" aria-label="Uçuş göstergeleri ve yerel navigasyon">
    <AttitudeDisplay flight={flight} />
    <section className="deck-instrument deck-hsi" aria-label="HSI yatay durum ve rota göstergesi">
      <div className="deck-instrument-title"><span>HSI · NAVIGATION</span><span className="deck-online">SIM LOCAL NAV</span></div>
      <CourseDisplay nav={nav} />
      <div className="deck-nav-readouts">
        <div><span>BRG</span><strong>{fmt3(nav.bearing)}°</strong></div>
        <div><span>CRS</span><strong>{fmt3(nav.course)}°</strong></div>
        <div><span>DIST</span><strong>{Math.round(nav.distanceMeters)} <small>m</small></strong></div>
        <div><span>ETA</span><strong>{formatEta(nav.etaSeconds)}</strong></div>
      </div>
      <div className="deck-course-chooser">
        <label>HEDEF
          <select value={target} onChange={event => onTargetChange(event.target.value as NavTarget)}>
            <option value="runway">Pist merkezi</option>
            <option value="approach">Yaklaşma noktası</option>
          </select>
        </label>
        <div className="deck-course-buttons"><span>CRS</span>
          <button type="button" title="Rotayı 5° azalt" onClick={() => onCourseChange(courseStep(course, -5))}>−5°</button>
          <button type="button" title="Rotayı pist istikametine sıfırla" onClick={() => onCourseChange(wrapHeading(field.runway.heading))}>RWY</button>
          <button type="button" title="Seçili hedefe doğrudan rota" onClick={() => onCourseChange(wrapHeading(nav.bearing))}>DCT</button>
          <button type="button" title="Rotayı 5° artır" onClick={() => onCourseChange(courseStep(course, 5))}>+5°</button>
        </div>
      </div>
      <p className="deck-nav-status">{nav.waypoint.label} · {nav.toFrom} · XTK {Math.round(nav.crossTrackMeters)} m · GS {Math.round(nav.groundspeed * 3.6)} km/sa</p>
    </section>
    <div className="deck-side-data">
      <div className="deck-metric"><span>IAS · HAVA HIZI</span><strong>{Math.round(flight.airspeed * 3.6)}<small>km/sa</small></strong></div>
      <div className="deck-metric"><span>AGL · YERDEN</span><strong>{Math.max(0, Math.round(flight.position[1] - field.height(flight.position[0], -flight.position[2])))}<small>m</small></strong></div>
      <div className="deck-metric"><span>TRACK · YER İZİ</span><strong>{nav.track === null ? '---' : fmt3(nav.track)}<small>°</small></strong></div>
      <div className="deck-metric"><span>CDI · YANAL SAPMA</span><strong>{Math.abs(nav.cdi).toFixed(1)}<small>{nav.cdi < 0 ? 'SOL' : nav.cdi > 0 ? 'SAĞ' : 'ORTA'}</small></strong></div>
      <p className="deck-disclaimer">Yerel simülasyon navigasyonu. Gerçek uçuşta kullanılmaz.</p>
    </div>
  </div>
}
