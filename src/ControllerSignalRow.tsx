import { hasTravel, type Travel } from './input'

export function signalPosition(value: number, min: number, max: number): number | null {
  if (![value, min, max].every(Number.isFinite) || min >= max) return null
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

type Props = {
  kind: 'axis' | 'button'
  index: number
  value: number
  travel?: Travel
}

export function ControllerSignalRow({ kind, index, value, travel }: Props) {
  const isAxis = kind === 'axis'
  const min = isAxis ? -1 : 0
  const max = 1
  const position = signalPosition(value, min, max)
  const from = travel ? signalPosition(travel.min, min, max) : null
  const to = travel ? signalPosition(travel.max, min, max) : null
  const moving = isAxis && hasTravel(travel)
  const title = `${isAxis ? 'Eksen' : 'Düğme'} ${index + 1}`
  const state = position === null ? 'Sinyal yok'
    : isAxis ? (moving ? 'Hareket var' : 'Sabit')
    : value > .5 ? 'Basılı' : 'Boşta'

  return <div className="signal-row">
    <div className="signal-row-heading">
      <span className="signal-name">{title}</span>
      <output className="signal-value" aria-label={`${title} değeri`}>{position === null ? '—' : value.toFixed(2)}</output>
      <span className={`signal-state ${moving ? 'signal-active' : ''}`}>{state}</span>
    </div>
    <div
      className="signal-track"
      role="meter"
      aria-label={title}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={position === null ? undefined : value}
      aria-valuetext={position === null ? 'Sinyal bekleniyor' : value.toFixed(2)}
    >
      {isAxis && <span className="signal-zero" aria-hidden="true" />}
      {isAxis && from !== null && to !== null && to > from &&
        <span className="signal-travel" aria-hidden="true" style={{ left: `${from}%`, width: `${to - from}%` }} />}
      {position !== null &&
        <span className="signal-cursor" aria-hidden="true" style={{ left: `${position}%` }} />}
    </div>
    {isAxis && <div className="signal-row-footer">
      <span>−1</span>
      <span>{moving && travel ? `Ölçülen aralık: ${travel.min.toFixed(2)} / ${travel.max.toFixed(2)}` : '0 · orta nokta'}</span>
      <span>+1</span>
    </div>}
  </div>
}
