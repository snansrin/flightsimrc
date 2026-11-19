import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Controls } from './flight'
import { calibrationRange, flightChannels, standardMapping, calibrateAxis, defaultMapping, defaultTuning, defaultChannels, deviceSources, detectMovedSource, gamepadControls, normalizeSource, readSource, type Mapping, type InputSource, type AxisKey, type InputTuning, type Calibration } from './input'
import { hidApi, openHidController, type HidController, type HidDeviceLike } from './hid'
import { hangar, hangarAircraft, soundFamily } from './hangar'
import { fields } from './sim/fields'
import { assessLesson, beginLesson, lessons, type Lesson, type LessonRun } from './school'
import { FieldMap } from './scene/FieldMap'
import type { CameraMode } from './scene/FlightScene'
import { applyDisplayControls, newFlightSimulation, physicsFieldId, toDisplayFlight } from './sim/bridge'
import { EngineAudio } from './audio'
import { connectRoom, createRoomCode, normalizePilotName, normalizeRoomCode, roomTopic, type RemotePilot, type RoomPilot, type RoomState } from './multiplayer'
import './style.css'

const FlightScene = lazy(() => import('./scene/FlightScene'))
const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
type IndexedHid = HidController & { index: number }
type SetupStep = { index: number; neutral: number[]; source?: InputSource; positive?: number }

function connectedPads(hidControllers: IndexedHid[]): Gamepad[] {
  let gamepads: Gamepad[] = []
  try { gamepads = [...(navigator.getGamepads?.() || [])].filter((pad): pad is Gamepad => Boolean(pad?.connected)) } catch { /* Gamepad API unavailable. */ }
  const hidPads = hidControllers.map(controller => ({
    id: controller.id, index: controller.index, connected: controller.device.opened && controller.reportsReceived > 0, mapping: '',
    axes: controller.axes, buttons: controller.buttons.map(value => ({ value, pressed: value > .5, touched: value > 0 })),
  } as unknown as Gamepad))
  return [...gamepads, ...hidPads.filter(pad => pad.connected)]
}
function choosePad(pads: Gamepad[], selectedIndex: number | null): Gamepad | undefined {
  return selectedIndex === null ? [...pads].sort((a, b) => b.axes.length - a.axes.length || b.buttons.length - a.buttons.length)[0] : pads.find(pad => pad.index === selectedIndex)
}
function ControllerDiscovery({ pads, selected, onSelect, onMessage }: {
  pads: { index: number; id: string; axes: number; buttons: number }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onMessage: (message: string) => void
}) {
  if (pads.length) return <label className="email-field">Uçuş kumandası
    <select value={selected ?? 'auto'} onChange={e => onSelect(e.target.value === 'auto' ? null : Number(e.target.value))}>
      <option value="auto">Otomatik cihaz seçimi</option>
      {pads.map(p => <option key={p.index} value={p.index}>{p.id.slice(0, 50)} · {p.axes} eksen / {p.buttons} düğme</option>)}
    </select>
  </label>
  return <div className="device-help"><strong>Tarayıcı kumanda görmüyor</strong>
    <p>Kumandayı veya joystick'i bilgisayara veri taşıyan USB kablosuyla bağla. Gerekliyse cihazın simülatör/gamepad kipini aç. Kolu oynatarak cihazı etkinleştir. İşletim sistemi girişlerini görse bile tarayıcıda eksik eksen varsa USB HID bağlantısını dene.</p>
    <button type="button" onClick={() => {
      try {
        const count = [...(navigator.getGamepads?.() || [])].filter(Boolean).length
        onMessage(count ? `${count} kumanda bulundu. Listeden seç.` : 'Tarayıcı hâlâ oyun kumandası görmüyor. kumandanın simülatör kipini kontrol et veya USB HID bağlantısını dene.')
      } catch { onMessage('Tarayıcı Gamepad erişimine izin vermiyor.') }
    }}>Cihazları yeniden tara</button>
  </div>
}
function App() {
  const simRef = useRef<HTMLElement>(null)
  const [vehicle, setVehicle] = useState('trainer')
  const [engine] = useState(() => newFlightSimulation('trainer'))
  const simulation = useRef(engine)
  const lessonRun = useRef<LessonRun | null>(null)
  const [lessonHud, setLessonHud] = useState<LessonRun | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<Lesson>(lessons[0])
  const flight = useRef(toDisplayFlight(simulation.current))
  const sound = useRef<EngineAudio | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const controls = useRef<Controls>({ ...zero })
  const keys = useRef(new Set<string>())
  const [hud, setHud] = useState(toDisplayFlight(simulation.current))
  const [fieldIndex, setFieldIndex] = useState(0)
  const [mapping, setMapping] = useState<Mapping>(defaultMapping)
  const [auxiliary, setAuxiliary] = useState<InputSource[]>([])
  const [auxReversed, setAuxReversed] = useState<boolean[]>([])
  const [auxCalibration, setAuxCalibration] = useState<(Calibration[AxisKey] | undefined)[]>([])
  const [tuning, setTuning] = useState<InputTuning>(() => { try { const saved = JSON.parse(localStorage.getItem('flight-tuning') || '{}'); return { ...defaultTuning, ...saved, reversed: { ...defaultTuning.reversed, ...saved.reversed } } } catch { return defaultTuning } })
  const [padAxes, setPadAxes] = useState<number[]>([])
  const [padButtons, setPadButtons] = useState<number[]>([])
  const [padName, setPadName] = useState('Klavye')
  const [availablePads, setAvailablePads] = useState<{ index: number; id: string; axes: number; buttons: number }[]>([])
  const [selectedPadIndex, setSelectedPadIndex] = useState<number | null>(null)
  const hidControllers = useRef<IndexedHid[]>([])
  const pendingHid = useRef(new Set<HidDeviceLike>())
  const hidIndex = useRef(-1)
  const setupProfile = useRef<{ mapping: Mapping; calibration: Calibration } | null>(null)
  const [setup, setSetup] = useState<SetupStep | null>(null)
  const autoPadIndex = useRef<number | null>(null)
  const padBaselines = useRef(new Map<number, { axes: number[]; buttons: number[] }>())
  const [calibration, setCalibration] = useState<Calibration>({})
  const activeDevice = useRef('')
  const deviceProfileId = useRef('')
  const [controllerArmed, setControllerArmed] = useState(false)
  const [controllerMessage, setControllerMessage] = useState('')
  const [detectKey, setDetectKey] = useState<AxisKey | `aux:${number}` | null>(null)
  const detectBaseline = useRef<number[]>([])
  const detectButtonsBaseline = useRef<number[]>([])
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase')
  const [cameraZoom, setCameraZoom] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [showRoom, setShowRoom] = useState(false)
  const [roomInput, setRoomInput] = useState(() => normalizeRoomCode(new URLSearchParams(location.search).get('room') || ''))
  const [pilotName, setPilotName] = useState(() => localStorage.getItem('flight-pilot-name') || '')
  const [roomPassword, setRoomPassword] = useState('')
  const [roomIsHost, setRoomIsHost] = useState(false)
  const [roomIsProtected, setRoomIsProtected] = useState(false)
  const [roomChannel, setRoomChannel] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomStatus, setRoomStatus] = useState<RoomState>('disconnected')
  const [roomMessage, setRoomMessage] = useState('')
  const [peers, setPeers] = useState<RemotePilot[]>([])
  const [roomCount, setRoomCount] = useState(1)
  const [roomPilots, setRoomPilots] = useState<RoomPilot[]>([])
  const pilotId = useRef(crypto.randomUUID())
  const roomFlight = useRef({ vehicle, fieldIndex })
  roomFlight.current = { vehicle, fieldIndex }
  const attachHid = async (device: HidDeviceLike) => {
    if (pendingHid.current.has(device) || hidControllers.current.some(controller => controller.device === device)) return
    pendingHid.current.add(device)
    try {
      const controller = await openHidController(device)
      if (!pendingHid.current.has(device)) { await controller.close(); return }
      hidControllers.current.push({ ...controller, index: hidIndex.current--, get reportsReceived() { return controller.reportsReceived } })
    } finally {
      pendingHid.current.delete(device)
    }
  }
  useEffect(() => {
    const api = hidApi()
    if (!api) return
    let disposed = false
    const connect = ({ device }: { device: HidDeviceLike }) => {
      if (!disposed) void attachHid(device).catch(() => {})
    }
    const disconnect = ({ device }: { device: HidDeviceLike }) => {
      pendingHid.current.delete(device)
      const controller = hidControllers.current.find(item => item.device === device)
      hidControllers.current = hidControllers.current.filter(item => item.device !== device)
      if (controller) void controller.close().catch(() => {})
    }
    api.addEventListener('connect', connect)
    api.addEventListener('disconnect', disconnect)
    void api.getDevices().then(devices => devices.forEach(device => connect({ device }))).catch(() => {})
    return () => {
      disposed = true
      api.removeEventListener('connect', connect)
      api.removeEventListener('disconnect', disconnect)
      pendingHid.current.clear()
      for (const controller of hidControllers.current) void controller.close().catch(() => {})
      hidControllers.current = []
    }
  }, [])
  useEffect(() => {
    if (!roomCode || !roomChannel) return
    setRoomStatus('connecting')
    const disconnect = connectRoom({
      code: roomCode, topic: roomChannel, id: pilotId.current, name: pilotName, isHost: roomIsHost,
      getFlight: () => ({ state: flight.current, vehicle: roomFlight.current.vehicle, field: roomFlight.current.fieldIndex }),
      onStatus: (status, message) => { setRoomStatus(status); if (message) setRoomMessage(message) },
      onPeers: (remote, count) => { setPeers(remote); setRoomCount(count) },
      onRoster: setRoomPilots,
      onField: field => { if (field !== roomFlight.current.fieldIndex) { setFieldIndex(field); simulation.current.reset({ aircraft: hangarAircraft(roomFlight.current.vehicle).id, field: physicsFieldId(field) }); flight.current = toDisplayFlight(simulation.current) } },
    })
    return disconnect
  }, [roomCode, roomChannel, roomIsHost])
  useEffect(() => {
    if (!detectKey) return
    const timer = window.setTimeout(() => { setDetectKey(null); setControllerMessage('Kol hareketi algılanmadı. Canlı eksenleri kontrol et; gerekirse USB HID kumandası bağla.') }, 15000)
    return () => window.clearTimeout(timer)
  }, [detectKey])
  useEffect(() => {
    if (!detectKey) return
    const source = detectMovedSource(detectBaseline.current, padAxes, detectButtonsBaseline.current, padButtons)
    if (source === null) return
    if (detectKey.startsWith('aux:')) {
      const index = Number(detectKey.slice(4))
      const next = [...auxiliary]; next[index] = source; setAuxiliary(next); saveDeviceSetting('auxiliary', next)
      const ranges = [...auxCalibration]; ranges[index] = undefined; setAuxCalibration(ranges); saveDeviceSetting('auxCalibration', ranges)
    } else {
      const key = detectKey as AxisKey
      const nextMapping = { ...mapping, [key]: source }
      const nextCalibration = { ...calibration, [key]: undefined }
      setMapping(nextMapping); setCalibration(nextCalibration)
      saveDeviceSetting('mapping', nextMapping); saveDeviceSetting('calibration', nextCalibration)
    }
    setControllerArmed(false)
    setControllerMessage(`${detectKey} için ${source} bulundu. Min/orta/maks konumlarını kalibre et.`)
    setDetectKey(null)
  }, [padAxes, padButtons, detectKey])
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.target instanceof HTMLElement && (e.target.closest('input,select,button,textarea') || e.target.isContentEditable)) return; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); keys.current.add(e.code) }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])
  useEffect(() => {
    let frame = 0, last = performance.now(), accumulator = 0, display = 0
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1); last = now
      const pads = connectedPads(hidControllers.current)
      for (const candidate of pads) {
        const currentAxes = [...candidate.axes], currentButtons = candidate.buttons.map(button => button.value)
        const baseline = padBaselines.current.get(candidate.index)
        if (!baseline || baseline.axes.length !== currentAxes.length || baseline.buttons.length !== currentButtons.length) {
          padBaselines.current.set(candidate.index, { axes: currentAxes, buttons: currentButtons })
        } else if (detectMovedSource(baseline.axes, currentAxes, baseline.buttons, currentButtons)) {
          if (selectedPadIndex === null && !controllerArmed && !setup) autoPadIndex.current = candidate.index
          padBaselines.current.set(candidate.index, { axes: currentAxes, buttons: currentButtons })
        }
      }
      for (const index of padBaselines.current.keys()) if (!pads.some(pad => pad.index === index)) padBaselines.current.delete(index)
      if (autoPadIndex.current !== null && !pads.some(pad => pad.index === autoPadIndex.current)) autoPadIndex.current = null
      if (selectedPadIndex !== null && !pads.some(p => p.index === selectedPadIndex)) setSelectedPadIndex(null)
      const pad = choosePad(pads, selectedPadIndex ?? autoPadIndex.current)
      setAvailablePads(previous => {
        const next = pads.map(p => ({ index: p.index, id: p.id, axes: p.axes.length, buttons: p.buttons.length }))
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
      })
      setPadName(previous => { const next = pad?.id || (selectedPadIndex === null ? 'Klavye' : 'Seçili kumanda bağlı değil'); return previous === next ? previous : next })
      const deviceKey = pad ? `${pad.index}:${pad.id}:${pad.axes.length}:${pad.buttons.length}` : ''
      const changedDevice = deviceKey !== activeDevice.current
      if (changedDevice) {
        if (!pad && controllerArmed) setPaused(true)
        setSetup(null)
        setDetectKey(null)
        activeDevice.current = deviceKey
        deviceProfileId.current = pad?.id ?? ''
        setControllerArmed(false)
        if (pad) { setPaused(true); setShowSettings(true); setControllerMessage('Eşlemeyi doğrula veya rehberli kalibrasyonu çalıştır. Gaz rölantideyken kumandayı etkinleştir.') }
        const prefix = `flight-device:${deviceProfileId.current}:`
        if (pad) {
          const defaults = defaultChannels(pad.axes.length, pad.buttons.length)
          const standard = pad.mapping === 'standard' && pad.axes.length >= 4 && pad.buttons.length >= 8
          const hidAxes = hidControllers.current.find(controller => controller.index === pad.index)?.layout.flightAxes ?? {}
          const baseMapping = { ...(standard ? standardMapping : defaults.mapping), ...hidAxes }
          const sources = deviceSources(pad.axes.length, pad.buttons.length)
          const assigned = new Set(Object.values(hidAxes))
          for (const { key } of flightChannels) {
            if (hidAxes[key]) continue
            if (assigned.has(baseMapping[key])) baseMapping[key] = sources.find(source => !assigned.has(source)) ?? baseMapping[key]
            assigned.add(baseMapping[key])
          }
          const baseTuning = {
            ...defaultTuning,
            reversed: {
              ...defaultTuning.reversed,
              elevator: !standard && !hidAxes.elevator,
              throttle: !standard && !hidAxes.throttle,
            },
          }
          const defaultAux = sources.filter(source => !Object.values(baseMapping).includes(source))
          try {
            const savedMapping = JSON.parse(localStorage.getItem(prefix + 'mapping') || 'null')
            const savedTuning = JSON.parse(localStorage.getItem(prefix + 'tuning') || 'null')
            const savedCalibration = JSON.parse(localStorage.getItem(prefix + 'calibration') || '{}')
            setMapping(Object.fromEntries((Object.keys(defaults.mapping) as AxisKey[]).map(key => [key, normalizeSource(savedMapping?.[key], baseMapping[key])])) as Mapping)
            const savedAuxiliary = JSON.parse(localStorage.getItem(prefix + 'auxiliary') || 'null')
            setAuxiliary(defaultAux.map((source, index) => normalizeSource(savedAuxiliary?.[index], source)))
            const savedAuxReversed = JSON.parse(localStorage.getItem(prefix + 'auxReversed') || 'null')
            setAuxReversed(defaultAux.map((_, index) => savedAuxReversed?.[index] === true))
            const savedAuxCalibration = JSON.parse(localStorage.getItem(prefix + 'auxCalibration') || 'null')
            setAuxCalibration(defaultAux.map((_, index) => savedAuxCalibration?.[index]))
            setTuning(savedTuning ? { ...baseTuning, ...savedTuning, reversed: { ...baseTuning.reversed, ...savedTuning.reversed } } : baseTuning)
            setCalibration(savedCalibration)
          } catch { setMapping(baseMapping); setAuxiliary(defaultAux); setAuxReversed(defaultAux.map(() => false)); setAuxCalibration(defaultAux.map(() => undefined)); setTuning(baseTuning); setCalibration({}) }
        }
        controls.current = { ...zero }
      }
      if (pad && controllerArmed && !changedDevice) {
        const target = gamepadControls(pad, mapping, tuning, calibration)
        const response = 1 - Math.exp(-delta * 10)
        controls.current = {
          throttle: controls.current.throttle + (target.throttle - controls.current.throttle) * response,
          aileron: controls.current.aileron + (target.aileron - controls.current.aileron) * response,
          elevator: controls.current.elevator + (target.elevator - controls.current.elevator) * response,
          rudder: controls.current.rudder + (target.rudder - controls.current.rudder) * response,
        }
      }
      else {
        const k = keys.current
        const target = { aileron: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), elevator: (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0), rudder: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) }
        const response = 1 - Math.exp(-delta * 7)
        controls.current = { throttle: Math.max(0, Math.min(1, controls.current.throttle + ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * delta * .45)), aileron: controls.current.aileron + (target.aileron - controls.current.aileron) * response, elevator: controls.current.elevator + (target.elevator - controls.current.elevator) * response, rudder: controls.current.rudder + (target.rudder - controls.current.rudder) * response }
      }
      if (!paused && !changedDevice) {
        accumulator += delta
        while (accumulator >= 1 / 60) {
          applyDisplayControls(simulation.current, controls.current)
          simulation.current.update(1 / 60)
          flight.current = toDisplayFlight(simulation.current)
          if (lessonRun.current) assessLesson(lessonRun.current, simulation.current, 1 / 60)
          accumulator -= 1 / 60
        }
      }
      sound.current?.update(soundFamily(vehicle), controls.current.throttle, flight.current.airspeed, paused || flight.current.crashed)
      if (now - display > 100) { setHud({ ...flight.current }); if (lessonRun.current) setLessonHud({ ...lessonRun.current }); setPadAxes(pad ? [...pad.axes] : []); setPadButtons(pad ? pad.buttons.map(button => button.value) : []); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [calibration, controllerArmed, fieldIndex, mapping, selectedPadIndex, tuning, paused, setup, vehicle])
  const clearLesson = () => {
    lessonRun.current = null
    setLessonHud(null)
  }
  const reset = (kind = vehicle, nextField = fieldIndex, lesson?: Lesson) => {
    engine.reset({
      aircraft: hangarAircraft(kind).id,
      field: physicsFieldId(nextField),
      airborne: lesson && 'airborne' in lesson ? lesson.airborne : undefined,
    })
    flight.current = toDisplayFlight(engine)
    controls.current = { ...zero }
    keys.current.clear()
    setHud(flight.current)
    if (lesson) {
      const run = beginLesson(lesson, engine)
      lessonRun.current = run
      setLessonHud({ ...run })
    } else clearLesson()
  }
  const retry = () => reset(vehicle, fieldIndex, lessonRun.current?.lesson)
  const launchLesson = () => {
    setVehicle(selectedLesson.aircraft)
    setFieldIndex(0)
    reset(selectedLesson.aircraft, 0, selectedLesson)
    setPaused(false)
    simRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const toggleSound = async () => { if (sound.current) { await sound.current.close(); sound.current = null; setSoundOn(false) } else { sound.current = new EngineAudio(); await sound.current.resume(); setSoundOn(true) } }
  const saveDeviceSetting = (name: string, value: unknown) => { if (deviceProfileId.current) localStorage.setItem(`flight-device:${deviceProfileId.current}:${name}`, JSON.stringify(value)) }
  const updateMapping = (key: AxisKey, source: InputSource) => {
    const next = { ...mapping, [key]: source }
    const nextCalibration = { ...calibration, [key]: undefined }
    setMapping(next); setCalibration(nextCalibration); setControllerArmed(false)
    saveDeviceSetting('mapping', next); saveDeviceSetting('calibration', nextCalibration)
  }
  const beginAxisDetection = (key: AxisKey | `aux:${number}`) => {
    detectBaseline.current = [...padAxes]
    detectButtonsBaseline.current = [...padButtons]
    setDetectKey(key)
    setControllerMessage(`${key} kolunu şimdi tam aralıkta hareket ettir.`)
  }
  const updateTuning = (next: InputTuning) => { setControllerArmed(false); setTuning(next); saveDeviceSetting('tuning', next) }
  const captureCalibration = (key: AxisKey, point: 'min' | 'center' | 'max') => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex ?? autoPadIndex.current)
    const raw = pad ? readSource(pad, mapping[key]) : undefined
    if (raw === undefined) return
    const next = { ...calibration, [key]: { min: -1, center: 0, max: 1, ...calibration[key], [point]: raw } }
    setCalibration(next); saveDeviceSetting('calibration', next)
    setControllerArmed(false)
    const nextTuning = { ...tuning, reversed: { ...tuning.reversed, [key]: false } }
    setTuning(nextTuning); saveDeviceSetting('tuning', nextTuning)
    setControllerMessage(`${key} ${point} noktası ${raw.toFixed(2)} kaydedildi. Kalibrasyon bitince yönü ve gaz sıfırını kontrol et.`)
  }
  const updateAuxiliary = (index: number, source: InputSource) => {
    const next = [...auxiliary]; next[index] = source; setAuxiliary(next); saveDeviceSetting('auxiliary', next)
    const ranges = [...auxCalibration]; ranges[index] = undefined; setAuxCalibration(ranges); saveDeviceSetting('auxCalibration', ranges)
    setControllerArmed(false)
  }
  const captureAuxiliary = (index: number, point: 'min' | 'center' | 'max') => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex ?? autoPadIndex.current)
    const raw = pad ? readSource(pad, auxiliary[index]) : undefined
    if (raw === undefined) return
    const next = [...auxCalibration]; next[index] = { min: -1, center: 0, max: 1, ...next[index], [point]: raw }
    setAuxCalibration(next); saveDeviceSetting('auxCalibration', next)
    setControllerArmed(false)
  }
  const sourceOptions = (selected: InputSource) => {
    const sources = deviceSources(padAxes.length, padButtons.length)
    if (!sources.includes(selected)) sources.unshift(selected)
    return sources.map(source => <option key={source} value={source}>{source.startsWith('axis:') ? `Eksen ${Number(source.slice(5)) + 1}` : `Düğme ${Number(source.slice(7)) + 1}`}</option>)
  }
  const copyControllerReport = async () => {
    const pads = connectedPads(hidControllers.current)
    const report = pads.length
      ? pads.map(pad => `${pad.id} | index ${pad.index} | mapping ${pad.mapping || 'yok'} | ${pad.axes.length} eksen, ${pad.buttons.length} düğme\nEksenler: ${pad.axes.map(value => value.toFixed(2)).join(', ')}\nDüğmeler: ${pad.buttons.map(button => button.value.toFixed(2)).join(', ')}`).join('\n\n')
      : 'Tarayıcı bağlı Gamepad cihazı bildirmiyor.'
    try { await navigator.clipboard.writeText(report); setControllerMessage('Kumanda tanı bilgisi kopyalandı. Bağlantı sorununu incelemek için paylaşabilirsin.') }
    catch { setControllerMessage(report) }
  }
  const requestHidController = async () => {
    const api = hidApi()
    if (!api) { setControllerMessage('Bu tarayıcı doğrudan USB HID bağlantısını desteklemiyor. Chrome veya Edge kullan.'); return }
    try {
      const devices = await api.requestDevice({ filters: [] })
      if (!devices.length) { setControllerMessage('Cihaz seçimi iptal edildi.'); return }
      for (const device of devices) await attachHid(device)
      setControllerMessage('USB HID açıldı. Bir kolu oynat ve canlı girdilerin değiştiğini kontrol et.')
    } catch (error) { setControllerMessage(error instanceof Error ? `USB HID bağlantısı kurulamadı: ${error.message}` : 'USB HID bağlantısı kurulamadı.') }
  }
  const advanceSetup = () => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex ?? autoPadIndex.current)
    if (!pad) return
    if (!setup) {
      setupProfile.current = { mapping: { ...mapping }, calibration: {} }
      setControllerArmed(false)
      setDetectKey(null)
      setSetup({ index: 0, neutral: [...pad.axes] })
      return
    }
    const profile = setupProfile.current
    if (!profile) return
    const channel = flightChannels[setup.index]
    if (!setup.source) {
      const used = flightChannels.slice(0, setup.index).map(({ key }) => profile.mapping[key])
      const values = pad.axes.map((value, index) => used.includes(`axis:${index}`) ? NaN : value)
      const source = detectMovedSource(setup.neutral, values, [], [])
      const positive = source ? readSource(pad, source) : undefined
      if (!source || positive === undefined) { setControllerMessage('Belirgin bir hareket bulunamadı. Yalnızca istenen kolu uç konuma getir.'); return }
      setSetup({ ...setup, source, positive })
      setControllerMessage('')
      return
    }
    const negative = readSource(pad, setup.source)
    if (negative === undefined || setup.positive === undefined) return
    const range = calibrationRange(channel.key, negative, setup.positive, setup.neutral[Number(setup.source.slice(5))])
    if (!range) { setControllerMessage('İki uç konum ve merkez arasında yeterli hareket görülmedi. Kolu karşı uçta tut.'); return }
    profile.mapping[channel.key] = setup.source
    profile.calibration[channel.key] = range
    setControllerMessage('')
    if (setup.index < flightChannels.length - 1) {
      setSetup({ index: setup.index + 1, neutral: [...pad.axes] })
      return
    }
    const auxiliary = deviceSources(pad.axes.length, pad.buttons.length).filter(source => !Object.values(profile.mapping).includes(source))
    setMapping(profile.mapping)
    setCalibration(profile.calibration)
    setAuxiliary(auxiliary)
    setAuxReversed([])
    setAuxCalibration([])
    updateTuning({ ...tuning, reversed: { aileron: false, elevator: false, throttle: false, rudder: false } })
    saveDeviceSetting('mapping', profile.mapping)
    saveDeviceSetting('calibration', profile.calibration)
    saveDeviceSetting('auxiliary', auxiliary)
    saveDeviceSetting('auxReversed', [])
    saveDeviceSetting('auxCalibration', [])
    setSetup(null)
    setControllerMessage('Dört kol kaydedildi. Gaz rölantideyken kumandayı etkinleştir.')
  }
  const armController = () => {
    const pads = connectedPads(hidControllers.current)
    const pad = choosePad(pads, selectedPadIndex ?? autoPadIndex.current)
    if (!pad) { setControllerMessage('Bağlı kumanda bulunamadı.'); return }
    if (new Set(Object.values(mapping)).size !== 4 || !Object.values(mapping).every(source => Number.isFinite(readSource(pad, source)))) {
      setControllerMessage('Dört farklı uçuş girdisi gerekli. Rehberli kalibrasyonu çalıştır veya kanal eşlemesini kontrol et.')
      return
    }
    const throttle = gamepadControls(pad, mapping, tuning, calibration).throttle
    if (throttle > .05) { setControllerMessage(`Gaz %${Math.round(throttle * 100)}. Gaz kanalını/yönünü ayarla ve kolu sıfıra indir.`); return }
    setControllerArmed(true)
    setControllerMessage('Kumanda hazır. Paneli kapatıp Devam düğmesine bas.')
  }
  const joinRoom = async (code: string, isHost: boolean) => {
    const normalized = normalizeRoomCode(code)
    if (normalized.length < 6) { setRoomMessage('En az 6 karakterlik oda kodu gir.'); return }
    const name = normalizePilotName(pilotName)
    if (name.length < 2) { setRoomMessage('Pilot adın 2–24 karakter olmalı.'); return }
    if (roomPassword && roomPassword.length < 8) { setRoomMessage('Oda şifresi en az 8 karakter olmalı.'); return }
    let topic: string
    try { topic = await roomTopic(normalized, roomPassword) }
    catch { setRoomMessage('Şifre hazırlanamadı. Güvenli bağlantı kullandığından emin ol.'); return }
    clearLesson()
    localStorage.setItem('flight-pilot-name', name)
    setRoomMessage('')
    setRoomInput(normalized)
    setRoomIsHost(isHost)
    setRoomIsProtected(Boolean(roomPassword))
    setRoomChannel(topic)
    setRoomCode(normalized)
    setRoomPassword('')
    setShowRoom(true)
    history.replaceState(null, '', `${location.pathname}?room=${normalized}`)
  }
  const leaveRoom = () => {
    setRoomCode('')
    setRoomChannel('')
    setRoomStatus('disconnected')
    setPeers([])
    setRoomPilots([])
    setRoomCount(1)
    setRoomMessage('')
    history.replaceState(null, '', location.pathname)
  }
  const copyRoomLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${roomCode}`); setRoomMessage('Davet bağlantısı kopyalandı.') }
    catch { setRoomMessage('Bağlantıyı adres çubuğundan kopyalayabilirsin.') }
  }
  const field = fields[fieldIndex]
  const aircraft = hangarAircraft(vehicle)
  const speed = hud.airspeed
  const bank = Math.round(hud.roll * 180 / Math.PI)
  const pitch = Math.round(hud.pitch * 180 / Math.PI)
  return <main><header><div className="brand"><img className="brand-icon" src={`${import.meta.env.BASE_URL}flightsimrc.svg`} width="44" height="44" alt="" /><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● {roomStatus === 'connected' ? `ODA ${roomCode} · ${roomCount} PİLOT` : 'SOLO EĞİTİM'}</span><button onClick={() => setShowRoom(true)}>◎ Çok oyunculu</button><button onClick={() => { setShowSettings(!showSettings); setPaused(true); keys.current.clear() }}>⚙ Kumanda ayarları</button></nav></header>
    <section className="sim" ref={simRef}>
      <div className="simtop"><div>{aircraft.name} <span className="sep">/</span> {aircraft.category}</div><div>{padName.slice(0, 42)}</div></div>
      <div className="viewport">
        <Suspense fallback={<div className="scene-loading" role="status">Uçuş alanı yükleniyor…</div>}>
          <FlightScene state={flight} controls={controls} field={field} cameraMode={cameraMode} zoom={cameraZoom} vehicle={vehicle}
            peers={peers.filter(pilot => pilot.field === fieldIndex)} />
        </Suspense>
        <div className="scene-label"><strong>{field.name}</strong><span>{field.weather.windSpeed.toFixed(1)} m/s · {field.weather.windDirection}° · {field.runway.length} m pist</span></div>
        <FieldMap field={field} flight={hud} />
        {cameraMode === 'onboard' && <div className="crosshair" aria-hidden="true">+</div>}
        {hud.crashed && <div className="crash"><strong>Uçuş sona erdi</strong><span>{engine.state.crashReason || 'Araç kaza yaptı.'}</span><button onClick={retry}>Yeniden başla</button></div>}
        {hud.stalled && !hud.crashed && <div className="flight-warning">STALL · BURNU İNDİR, HIZ KAZAN</div>}
        <div className="attitude"><span>YATIŞ {bank}°</span><span>BURUN {pitch}°</span><span>ALFA {Math.round(hud.angleOfAttack * 180 / Math.PI)}°</span></div>
        <div className="hud">
          <div><small>HAVA HIZI</small><strong>{Math.round(speed * 3.6)}</strong><span>km/sa</span></div>
          <div><small>YERDEN</small><strong>{Math.round(Math.max(0, engine.state.agl))}</strong><span>m</span></div>
          <div><small>GAZ</small><strong>{Math.round(controls.current.throttle * 100)}</strong><span>%</span></div>
          <div><small>BAŞ</small><strong>{Math.round(engine.headingDegrees) % 360}</strong><span>°</span></div>
        </div>
        {lessonHud && <div className="lesson-progress">
          <strong>{lessonHud.lesson.name}</strong>
          <span role="status">{lessonHud.status === 'passed' ? 'Başarılı' : lessonHud.status === 'failed' ? 'Ders tamamlanamadı' : lessonHud.message || 'Ders başladı'}</span>
          <progress aria-label="Ders hedefi" value={lessonHud.hold} max={lessonHud.lesson.seconds} />
          <small>{lessonHud.status === 'active' ? Math.ceil(Math.max(0, lessonHud.lesson.timeout - lessonHud.elapsed)) + ' sn kaldı' : lessonHud.message}</small>
        </div>}
      </div>
      <div className="toolbar">
        <label>MODEL <select value={vehicle} onChange={e => { const next = e.target.value; setVehicle(next); reset(next) }}>
          {hangar.map(({ id, spec }) => <option key={id} value={id}>{spec.name} · {spec.category}</option>)}
        </select></label>
        <label>UÇUŞ ALANI <select value={fieldIndex} disabled={Boolean(roomCode)} onChange={e => {
          const nextField = Number(e.target.value)
          const nextVehicle = fields[nextField].runway.surface === 'water' ? 'float1200' : vehicle
          setFieldIndex(nextField)
          setVehicle(nextVehicle)
          reset(nextVehicle, nextField)
        }}>
          {fields.map((entry, index) => <option value={index} key={entry.id}>{entry.name}</option>)}
        </select></label>
        <div>
          <label className="camera-choice">GÖRÜŞ <select value={cameraMode} onChange={e => setCameraMode(e.target.value as CameraMode)}>
            <option value="chase">Takip</option><option value="pilot">RC pilot</option><option value="onboard">Araç üstü</option>
          </select></label>
          <label className="camera-zoom">YAKINLIK <input type="range" min="0.6" max="2.4" step="0.1" value={cameraZoom} onChange={e => setCameraZoom(Number(e.target.value))} /></label>
          <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void simRef.current?.requestFullscreen() }}>Tam ekran</button>
          <button onClick={() => void toggleSound()}>{soundOn ? 'Sesi kapat' : 'Sesi aç'}</button>
          <button onClick={e => { setPaused(!paused); e.currentTarget.blur() }}>{paused ? 'Devam et' : 'Duraklat'}</button>
          <button onClick={e => { retry(); e.currentTarget.blur() }}>{lessonHud ? 'Dersi yeniden başlat' : 'Uçağı sıfırla'}</button>
        </div>
      </div>
    </section>
    <section className="academy" aria-labelledby="school-title">
      <div className="school-card">
        <h2 id="school-title">Uçuş okulu</h2>
        <label>Ders <select value={selectedLesson.id} onChange={event => setSelectedLesson(lessons.find(lesson => lesson.id === event.target.value) ?? lessons[0])}>
          {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.name}</option>)}
        </select></label>
        <p>{selectedLesson.instruction}</p>
        <button className="account-action" disabled={Boolean(roomCode)} onClick={event => { launchLesson(); event.currentTarget.blur() }}>Dersi başlat</button>
        {roomCode && <p>Dersler solo uçuşta açılır.</p>}
        {lessonHud && <button className="diagnostic-action" onClick={clearLesson}>Serbest uçuşa dön</button>}
      </div>
      <div className="hangar-card">
        <h2>{aircraft.name}</h2>
        <p>{aircraft.summary}</p>
        <dl><div><dt>Kütle</dt><dd>{aircraft.mass.toLocaleString('tr-TR')} kg</dd></div>
          <div><dt>{aircraft.family === 'fixed' ? 'Kanat açıklığı' : 'Gövde açıklığı'}</dt><dd>{aircraft.span.toLocaleString('tr-TR')} m</dd></div>
          {aircraft.family === 'fixed' && <div><dt>Hesaplanan stall</dt><dd>{Math.round(engine.stallSpeed * 3.6)} km/sa</dd></div>}
        </dl>
        <p>{aircraft.skills.join(' · ')}</p>
      </div>
    </section>
    <section className="info">
      <div><strong>KLAVYE</strong><p>W / S gaz, oklar yatış ve irtifa, A / D yatış, Q / E yön dümeni. Bir menüdeyken uçuşa dönmek için sahneye tıkla.</p></div>
      <div><strong>RC KUMANDA / JOYSTICK</strong><p>USB cihazını bağla ve bir kolu oynat. Eksik eksenlerde USB HID bağlantısını, kanal sırası veya yönü farklıysa rehberli kalibrasyonu kullan.</p></div>
      <div><strong>UÇUŞ ALANI</strong><p>{field.notes}</p></div>
    </section>
    {showRoom && <div className="overlay" onClick={() => setShowRoom(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowRoom(false)}>✕</button><p className="eyebrow">CANLI UÇUŞ</p><h2>Çok oyunculu oda</h2>
      {roomCode ? <>
        <p><strong>Oda: {roomCode}</strong> · {roomIsProtected ? 'Şifreli' : 'Şifresiz'} · {roomCount} pilot</p>
        <p role="status">{roomStatus === 'connected' ? 'Bağlı' : roomStatus === 'connecting' ? 'Oda aranıyor…' : roomStatus === 'error' ? 'Bağlantı kurulamadı' : 'Bağlantı yok'}</p>
        <div className="pilot-roster"><strong>Pilotlar</strong>{roomPilots.length ? <ul>{roomPilots.map(pilot => <li key={pilot.id}><span>{pilot.name}{pilot.id === pilotId.current ? ' (sen)' : ''}</span><small>{pilot.isHost ? 'Kurucu' : 'Pilot'}</small></li>)}</ul> : <p>Pilotlar bağlandığında burada görünür.</p>}</div>
        <button className="account-action" onClick={() => void copyRoomLink()}>Davet bağlantısını kopyala</button>
        <button className="room-leave" onClick={leaveRoom}>{roomStatus === 'error' ? 'Tekrar dene' : 'Odadan ayrıl'}</button>
        {roomIsProtected && <p className="muted">Davet bağlantısı şifreyi içermez. Şifreyi katılacak pilotlara ayrıca ilet.</p>}
      </> : <>
        <p>Pilot adını yaz. Yeni oda kurarken isteğe bağlı şifre belirle; katılan pilot aynı kodu ve şifreyi girsin.</p>
        <label className="email-field">Pilot adı<input value={pilotName} maxLength={24} onChange={e => setPilotName(e.target.value)} placeholder="Örn. Sinan" autoComplete="nickname" /></label>
        <label className="email-field">Oda şifresi (isteğe bağlı)<input type="password" value={roomPassword} minLength={8} maxLength={64} onChange={e => setRoomPassword(e.target.value)} placeholder="En az 8 karakter" autoComplete="off" /></label>
        <button className="account-action" onClick={() => void joinRoom(createRoomCode(), true)}>Yeni oda oluştur</button>
        <label className="email-field">Oda kodu<input value={roomInput} maxLength={10} onChange={e => setRoomInput(normalizeRoomCode(e.target.value))} placeholder="Örn. ABCD2345" /></label>
        <button className="account-action" onClick={() => void joinRoom(roomInput, false)}>Odaya katıl</button>
      </>}
      {roomMessage && <p role="alert">{roomMessage}</p>}
      <p className="muted">En fazla dört pilot. Şifreli odada yalnızca doğru kod ve şifreden türetilen kanala bağlanılır; bu sürümde sunucu tarafı hesap doğrulaması ve güçlü erişim denetimi yoktur.</p>
    </aside></div>}
    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">KUMANDA AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Bir düğmeye basarak cihazı tarayıcıda etkinleştir.</p><ControllerDiscovery pads={availablePads} selected={selectedPadIndex} onSelect={index => { setSetup(null); setSelectedPadIndex(index); setControllerArmed(false); setPaused(true) }} onMessage={setControllerMessage} /><button type="button" className="diagnostic-action" onClick={() => void requestHidController()}>USB HID kumandası bağla</button><button type="button" className="diagnostic-action" onClick={() => void copyControllerReport()}>Kumanda tanı bilgisini kopyala</button><div className="setup-card">
      {setup ? <>
        <strong>{setup.index + 1} / 4 · {flightChannels[setup.index].name}</strong>
        <p>Kolu {setup.source ? flightChannels[setup.index].negative : flightChannels[setup.index].positive} götür, orada tut ve kaydet.</p>
        <button type="button" onClick={advanceSetup}>Konumu kaydet</button>
        <button type="button" onClick={() => setSetup(null)}>İptal</button>
      </> : <>
        <p>Yatış, irtifa, yön ve gaz kollarını tanıt. Başlarken gaz rölantide, diğer kollar ortada olsun.</p>
        <button type="button" disabled={padAxes.filter(Number.isFinite).length < 4} onClick={advanceSetup}>Rehberli kalibrasyon</button>
      </>}
    </div><p className="muted">Tarayıcı bu cihazda {padAxes.length} eksen ve {padButtons.length} düğme bildiriyor. Panel, tarayıcının sunduğu {padAxes.length + padButtons.length} girdi için oluşur. Her girdi ayrı eşlenebilir.</p>{(Object.keys(mapping) as AxisKey[]).slice(0, Math.min(4, padAxes.length + padButtons.length)).map((key, index) => <div className="axis" key={key}><label htmlFor={`axis-${key}`}>{`Kanal ${index + 1} · ${key}`}</label><select id={`axis-${key}`} value={mapping[key]} onChange={e => updateMapping(key, e.target.value as InputSource)}>{sourceOptions(mapping[key])}</select><label className="reverse"><input type="checkbox" checked={tuning.reversed[key]} onChange={e => updateTuning({ ...tuning, reversed: { ...tuning.reversed, [key]: e.target.checked } })} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(key)}>{detectKey === key ? 'Kolu oynat…' : 'Ekseni bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'max')}>Maks</button></div></div>)}{auxiliary.map((source, index) => <div className="axis" key={index}><label htmlFor={`aux-${index}`}>Kanal {index + 5} · yardımcı</label><select id={`aux-${index}`} value={source} onChange={e => updateAuxiliary(index, e.target.value as InputSource)}>{sourceOptions(source)}</select><label className="reverse"><input type="checkbox" checked={auxReversed[index]} onChange={e => { const next = [...auxReversed]; next[index] = e.target.checked; setAuxReversed(next); saveDeviceSetting('auxReversed', next) }} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(`aux:${index}`)}>{detectKey === `aux:${index}` ? 'Kolu oynat…' : 'Kanalı bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'max')}>Maks</button></div><small className="channel-value">{(() => { const raw = source.startsWith('axis:') ? padAxes[Number(source.slice(5))] : padButtons[Number(source.slice(7))] * 2 - 1; if (!Number.isFinite(raw)) return 'Girdi yok'; const range = auxCalibration[index]; const calibrated = calibrateAxis(raw, range); return `${((auxReversed[index] ? -1 : 1) * calibrated).toFixed(2)}` })()}</small></div>)}<label className="tuning">Ölü bölge {Math.round(tuning.deadzone * 100)}%<input type="range" min="0" max="0.2" step="0.01" value={tuning.deadzone} onChange={e => updateTuning({ ...tuning, deadzone: Number(e.target.value) })} /></label><label className="tuning">Expo {Math.round(tuning.expo * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={tuning.expo} onChange={e => updateTuning({ ...tuning, expo: Number(e.target.value) })} /></label><button className="account-action" type="button" disabled={(!padAxes.length && !padButtons.length) || controllerArmed || Boolean(setup)} onClick={armController}>{controllerArmed ? 'Kumanda hazır' : 'Kumandayı etkinleştir'}</button>{controllerMessage && <p role="status">{controllerMessage}</p>}<div className="axis-monitor"><strong>CANLI GİRDİLER · {padAxes.length} EKSEN / {padButtons.length} DÜĞME</strong>{padAxes.length ? padAxes.map((value, i) => <div key={i}>Eksen {i + 1}<meter min={-1} max={1} value={Number.isFinite(value) ? value : 0} />{Number.isFinite(value) ? value.toFixed(2) : "Sinyal bekleniyor"}</div>) : <p>Eksen görünmüyor.</p>}{padButtons.map((value, i) => <div key={`button-${i}`}>Düğme {i + 1}<meter min={0} max={1} value={Number.isFinite(value) ? value : 0} />{Number.isFinite(value) ? value.toFixed(2) : "Sinyal bekleniyor"}</div>)}</div><p className="muted">İlk dört girdi uçuşu kontrol eder; sonraki girdiler izleme ve profil ayarları içindir. Her kanal için kolu en düşük, orta ve en yüksek konuma getirip ilgili düğmeye bas. Gaz ekseninde orta için kolu yarıya getir. Ayarlar bağlı cihaza özel saklanır. Kalibrasyondan sonra gaz yönünü ve sıfır gazı kontrol et.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
