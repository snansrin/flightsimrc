import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Controls } from './flight'
import { hasTravel, axisSignalSummary, observeTravel, validCalibration, type Travel, flightChannels, standardMapping, calibrateAxis, defaultMapping, defaultTuning, defaultChannels, deviceSources, detectMovedSource, gamepadControls, normalizeSource, readSource, type Mapping, type InputSource, type AxisKey, type InputTuning, type Calibration } from './input'
import { hidApi, openHidController, type HidController, type HidDeviceLike } from './hid'
import { hangar, hangarAircraft, soundFamily } from './hangar'
import { airfieldPilotPosition, fields } from './sim/fields'
import { assistProfiles } from './sim/simulation'
import { assessLesson, beginLesson, lessons, type Lesson, type LessonRun } from './school'
import { FlightDeck, FlightNavigation } from './FlightDeck'
import { type NavTarget } from './avionics'
import type { CameraMode } from './scene/FlightScene'
import { applyDisplayControls, cleanConfiguration, hasRetractableGear, newFlightSimulation, physicsFieldId, toDisplayFlight, type AirframeConfiguration } from './sim/bridge'
import { EngineAudio } from './audio'
import { ControllerSignalRow } from './ControllerSignalRow'
import { choosePreferredPad } from './controllerSelection'
import { prepareQuickFlight } from './quickFlight'
import { findGuidedAxis, guidedRange, type GuidedStep } from './guidedSetup'
import { satelliteCredit, WorldTerrain, type WorldStart } from './sim/worldTerrain'
import { connectRoom, createRoomCode, normalizePilotName, normalizeRoomCode, roomTopic, type RemotePilot, type RoomPilot, type RoomState } from './multiplayer'
import './style.css'

const FlightScene = lazy(() => import('./scene/FlightScene'))
const WorldPicker = lazy(() => import('./WorldPicker'))
const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
type IndexedHid = HidController & { index: number }

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
  return choosePreferredPad(pads, selectedIndex)
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
  const configuration = useRef(cleanConfiguration)
  const [airframeConfig, setAirframeConfig] = useState(cleanConfiguration)
  const [configMessage, setConfigMessage] = useState('')
  const setConfiguration = useCallback((next: AirframeConfiguration) => {
    configuration.current = next
    setAirframeConfig(next)
    setConfigMessage('')
  }, [])
  const keys = useRef(new Set<string>())
  const [hud, setHud] = useState(toDisplayFlight(simulation.current))
  const [fieldIndex, setFieldIndex] = useState(0)
  const [world, setWorld] = useState<{ start: WorldStart; terrain: WorldTerrain; field: ReturnType<WorldTerrain['field']>; key: number }>()
  const [showWorld, setShowWorld] = useState(() => new URLSearchParams(location.search).get('world') === '1')
  const [imagery, setImagery] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const worldSelection = useRef(0)
  const [deckVisible, setDeckVisible] = useState(true)
  const [navTarget, setNavTarget] = useState<NavTarget>('runway')
  const [course, setCourse] = useState(0)
  const [assistMode, setAssistMode] = useState('model')
  const [mapping, setMapping] = useState<Mapping>(defaultMapping)
  const [auxiliary, setAuxiliary] = useState<InputSource[]>([])
  const [auxReversed, setAuxReversed] = useState<boolean[]>([])
  const [auxCalibration, setAuxCalibration] = useState<(Calibration[AxisKey] | undefined)[]>([])
  const [tuning, setTuning] = useState<InputTuning>(() => { try { const saved = JSON.parse(localStorage.getItem('flight-tuning') || '{}'); return { ...defaultTuning, ...saved, reversed: { ...defaultTuning.reversed, ...saved.reversed }, rates: { ...defaultTuning.rates, ...saved.rates } } } catch { return defaultTuning } })
  const [padAxes, setPadAxes] = useState<number[]>([])
  const [padButtons, setPadButtons] = useState<number[]>([])
  const travel = useRef<{ axes: (Travel | undefined)[]; buttons: (Travel | undefined)[] }>({ axes: [], buttons: [] })
  const [axisTravel, setAxisTravel] = useState<(Travel | undefined)[]>([])
  const preferredHid = useRef<number | null>(null)
  const [padName, setPadName] = useState('Klavye')
  const [availablePads, setAvailablePads] = useState<{ index: number; id: string; axes: number; buttons: number }[]>([])
  const [selectedPadIndex, setSelectedPadIndex] = useState<number | null>(null)
  const hidControllers = useRef<IndexedHid[]>([])
  const pendingHid = useRef(new Set<HidDeviceLike>())
  const hidIndex = useRef(-1)
  const setupProfile = useRef<{ mapping: Mapping; calibration: Calibration } | null>(null)
  const [setup, setSetup] = useState<GuidedStep | null>(null)
  const manualCalibrationDraft = useRef<Partial<Record<AxisKey, Partial<{ min: number; center: number; max: number }>>>>({})
  const [calibration, setCalibration] = useState<Calibration>({})
  const activeDevice = useRef('')
  const deviceProfileId = useRef('')
  const [controllerArmed, setControllerArmed] = useState(false)
  const [throttleReverseOverride, setThrottleReverseOverride] = useState<boolean | null>(null)
  const [controllerMessage, setControllerMessage] = useState('')
  const [detectKey, setDetectKey] = useState<AxisKey | `aux:${number}` | null>(null)
  const detectBaseline = useRef<number[]>([])
  const detectButtonsBaseline = useRef<number[]>([])
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase')
  const activeCamera = useRef<CameraMode>(cameraMode)
  activeCamera.current = cameraMode
  const [cameraZoom, setCameraZoom] = useState(1.15)
  const [showSettings, setShowSettings] = useState(false)
  const [showRoom, setShowRoom] = useState(false)
  const commandFlaps = useCallback((next: AirframeConfiguration['flaps']) => {
    if (!engine.spec.flaps) return
    if (next > configuration.current.flaps && engine.state.airspeed > engine.spec.flaps.maxDeploySpeed) {
      setConfigMessage('Flap açma hızı aşıldı.')
      return
    }
    setConfiguration({ ...configuration.current, flaps: next })
  }, [engine, setConfiguration])
  const commandGear = useCallback(() => {
    if (!hasRetractableGear(engine.spec)) return
    if (configuration.current.gearDown && engine.state.onGround) {
      setConfigMessage('İniş takımı yerde kilitli.')
      return
    }
    setConfiguration({ ...configuration.current, gearDown: !configuration.current.gearDown })
  }, [engine, setConfiguration])
  useEffect(() => {
    if (showSettings || showRoom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (e.target instanceof HTMLElement && (e.target.closest('input,select,button,textarea') || e.target.isContentEditable)) return
      if (e.code === 'KeyG') commandGear()
      if (e.code === 'KeyF') {
        const current = configuration.current.flaps
        const overSpeed = engine.spec.flaps && engine.state.airspeed > engine.spec.flaps.maxDeploySpeed
        commandFlaps(overSpeed && current > 0 ? 0 : current === 0 ? .5 : current === .5 ? 1 : 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandFlaps, commandGear, engine, showRoom, showSettings])
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
  useEffect(() => {
    engine.assists = assistMode === 'model'
      ? { ...engine.spec.assists }
      : { ...engine.spec.assists, ...assistProfiles[Number(assistMode)] }
  }, [engine, vehicle, assistMode])
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
      onField: field => { if (field !== roomFlight.current.fieldIndex) { setFieldIndex(field); setConfiguration(cleanConfiguration); setCourse(fields[field].runway.heading); setNavTarget("runway"); simulation.current.reset({ aircraft: hangarAircraft(roomFlight.current.vehicle).id, field: physicsFieldId(field) }); flight.current = toDisplayFlight(simulation.current) } },
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
    const listener = airfieldPilotPosition(world?.field ?? fields[fieldIndex])
    let frame = 0, last = performance.now(), accumulator = 0, display = 0
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1); last = now
      const pads = connectedPads(hidControllers.current)
      const requested = preferredHid.current
      if (requested !== null && pads.some(pad => pad.index === requested)) {
        preferredHid.current = null
        setSelectedPadIndex(requested)
      }
      const pad = choosePad(pads, selectedPadIndex)
      setAvailablePads(previous => {
        const next = pads.map(p => ({ index: p.index, id: p.id, axes: p.axes.length, buttons: p.buttons.length }))
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
      })
      setPadName(previous => { const next = pad?.id || (selectedPadIndex === null ? 'Klavye' : 'Seçili kumanda bağlı değil'); return previous === next ? previous : next })
      const deviceKey = pad ? `${pad.index}:${pad.id}:${pad.axes.length}:${pad.buttons.length}` : ''
      const changedDevice = deviceKey !== activeDevice.current
      if (changedDevice) {
        travel.current = { axes: [], buttons: [] }
        if (controllerArmed) setPaused(true)
        setSetup(null)
        manualCalibrationDraft.current = {}
        setDetectKey(null)
        activeDevice.current = deviceKey
        deviceProfileId.current = pad?.id ?? ''
        setThrottleReverseOverride(null)
        setControllerArmed(false)
        if (pad) setControllerMessage('Kumanda algılandı. Uçuşa başlamak için ⚙ Kumanda ayarları bölümünden kumandayı etkinleştir; kalibrasyon isteğe bağlıdır.')
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
            const savedReverse = JSON.parse(localStorage.getItem(prefix + 'throttleReverseOverride') || 'null')
            setThrottleReverseOverride(typeof savedReverse === 'boolean' ? savedReverse : null)
            setMapping(Object.fromEntries((Object.keys(defaults.mapping) as AxisKey[]).map(key => [key, normalizeSource(savedMapping?.[key], baseMapping[key])])) as Mapping)
            const savedAuxiliary = JSON.parse(localStorage.getItem(prefix + 'auxiliary') || 'null')
            setAuxiliary(defaultAux.map((source, index) => normalizeSource(savedAuxiliary?.[index], source)))
            const savedAuxReversed = JSON.parse(localStorage.getItem(prefix + 'auxReversed') || 'null')
            setAuxReversed(defaultAux.map((_, index) => savedAuxReversed?.[index] === true))
            const savedAuxCalibration = JSON.parse(localStorage.getItem(prefix + 'auxCalibration') || 'null')
            setAuxCalibration(defaultAux.map((_, index) => savedAuxCalibration?.[index]))
            setTuning(savedTuning ? { ...baseTuning, ...savedTuning, reversed: { ...baseTuning.reversed, ...savedTuning.reversed }, rates: { ...defaultTuning.rates, ...savedTuning.rates } } : baseTuning)
            setCalibration(savedCalibration)
          } catch { setMapping(baseMapping); setAuxiliary(defaultAux); setAuxReversed(defaultAux.map(() => false)); setAuxCalibration(defaultAux.map(() => undefined)); setTuning(baseTuning); setCalibration({}) }
        }
        controls.current = { ...zero }
      }
      if (pad) {
        observeTravel(travel.current.axes, pad.axes)
        observeTravel(travel.current.buttons, pad.buttons.map(button => button.value))
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
      const waitingForTerrain = Boolean(world && imagery === 'loading')
      if (!paused && !showWorld && !changedDevice && !waitingForTerrain) {
        accumulator += delta
        while (accumulator >= 1 / 60) {
          applyDisplayControls(simulation.current, controls.current, configuration.current)
          simulation.current.update(1 / 60)
          flight.current = toDisplayFlight(simulation.current)
          if (lessonRun.current) assessLesson(lessonRun.current, simulation.current, 1 / 60)
          accumulator -= 1 / 60
        }
      }
      sound.current?.update(soundFamily(vehicle), controls.current.throttle, flight.current.airspeed,
        paused || showWorld || waitingForTerrain || flight.current.crashed, flight.current.engineSpeed, simulation.current.spec, flight.current,
        activeCamera.current === 'pilot' ? listener : undefined)
      if (now - display > 100) { setHud({ ...flight.current }); if (lessonRun.current) setLessonHud({ ...lessonRun.current }); setPadAxes(pad ? [...pad.axes] : []); setAxisTravel(travel.current.axes.map(range => range && { ...range })); setPadButtons(pad ? pad.buttons.map(button => button.value) : []); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [calibration, controllerArmed, fieldIndex, imagery, mapping, selectedPadIndex, tuning, paused, setup, vehicle, world, showWorld])
  const clearLesson = () => {
    lessonRun.current = null
    setLessonHud(null)
  }
  const reset = (kind = vehicle, nextField = fieldIndex, lesson?: Lesson, nextWorld: typeof world | null = world) => {
    const model = hangarAircraft(kind)
    engine.reset({
      aircraft: model.id,
      field: nextWorld?.field ?? physicsFieldId(nextField),
      airborne: nextWorld ? { altitude: nextWorld.start.altitude, airspeed: model.family === 'fixed' ? model.envelope.cruise : 0, offset: 0 }
        : lesson && 'airborne' in lesson ? lesson.airborne : undefined,
    })
    if (assistMode !== 'model') engine.assists = { ...engine.spec.assists, ...assistProfiles[Number(assistMode)] }
    flight.current = toDisplayFlight(engine)
    setConfiguration(cleanConfiguration)
    controls.current = { ...zero, throttle: nextWorld && padName === 'Klavye' ? model.envelope.hoverThrottle ?? .56 : 0 }
    keys.current.clear()
    setHud(flight.current)
    if (lesson) {
      const run = beginLesson(lesson, engine)
      lessonRun.current = run
      setLessonHud({ ...run })
    } else clearLesson()
  }
  const closeWorld = () => { worldSelection.current++; setShowWorld(false); keys.current.clear() }
  const launchWorld = async (start: WorldStart) => {
    const key = ++worldSelection.current
    const terrain = new WorldTerrain(start)
    await terrain.prepare()
    if (key !== worldSelection.current) return
    const next = { start, terrain, field: terrain.field(start.heading), key }
    setWorld(next)
    setImagery('loading')
    setCourse(start.heading)
    setNavTarget('runway')
    setCameraMode('chase')
    reset(vehicle, fieldIndex, undefined, next)
    closeWorld()
    setPaused(false)
    simRef.current?.scrollIntoView({ block: 'start' })
  }
  const retry = () => reset(vehicle, fieldIndex, lessonRun.current?.lesson)
  const launchLesson = () => {
    setVehicle(selectedLesson.aircraft)
    setFieldIndex(0)
    setWorld(undefined)
    reset(selectedLesson.aircraft, 0, selectedLesson, null)
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
  const updateTuning = (next: InputTuning) => { setTuning(next); saveDeviceSetting('tuning', next) }
  const updateReverse = (key: AxisKey, reversed: boolean) => {
    const next = { ...tuning, reversed: { ...tuning.reversed, [key]: reversed } }
    setTuning(next)
    saveDeviceSetting('tuning', next)
    if (key === 'throttle') {
      // Switching throttle polarity while armed can jump instantly to 100% throttle.
      // Require a new zero-throttle check before resuming.
      setThrottleReverseOverride(reversed)
      saveDeviceSetting('throttleReverseOverride', reversed)
      setControllerArmed(false)
      controls.current = { ...zero }
      setPaused(true)
      setControllerMessage('Gaz yönü değiştirildi. Güvenlik için kumanda durduruldu. Gazı yeni rölanti ucuna indirip Kalibrasyonsuz uçuşa başla düğmesine bas.')
    } else {
      setControllerMessage(`${key} ters yönü ${reversed ? 'açıldı' : 'kapatıldı'}. Yeni yön anında uygulanır; kumanda etkinse Ayarları kaydet ve uçuşa dön düğmesine bas.`)
    }
  }
  const resetThrottleReverse = () => {
    setThrottleReverseOverride(null)
    saveDeviceSetting('throttleReverseOverride', null)
    setControllerArmed(false)
    controls.current = { ...zero }
    setPaused(true)
    setControllerMessage('Gaz ters yönü otomatik moda alındı. Gazı rölantiye indirip Kalibrasyonsuz uçuşa başla düğmesine bas.')
  }
  const captureCalibration = (key: AxisKey, point: 'min' | 'center' | 'max') => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex)
    const raw = pad ? readSource(pad, mapping[key]) : undefined
    if (!Number.isFinite(raw)) { setControllerMessage('Bu kanal için canlı sinyal yok. Önce doğru ekseni eşleştir.'); return }
    const draft = { ...manualCalibrationDraft.current[key], [point]: raw }
    manualCalibrationDraft.current[key] = draft
    if (!Number.isFinite(draft.min) || !Number.isFinite(draft.center) || !Number.isFinite(draft.max)) {
      setControllerMessage(`${key}: ${point} kaydedildi (${raw!.toFixed(2)}). Min, Orta ve Maks noktalarının üçünü de kaydet; eski ayarlar şimdilik korunuyor.`)
      return
    }
    const complete = { min: draft.min!, center: draft.center!, max: draft.max! }
    if (!validCalibration(complete)) {
      setControllerMessage(`${key}: orta nokta iki uç arasında değil veya kol hareketi yetersiz. Min, Orta ve Maks konumlarını yeniden kaydet.`)
      return
    }
    const next = { ...calibration, [key]: complete }
    setCalibration(next); saveDeviceSetting('calibration', next)
    manualCalibrationDraft.current[key] = {}
    setControllerArmed(false)
    setControllerMessage(`${key} kalibrasyonu kaydedildi. Ters yön tercihin korundu; gaz yönünü ve rölantiyi kontrol et.`)
  }
  const updateAuxiliary = (index: number, source: InputSource) => {
    const next = [...auxiliary]; next[index] = source; setAuxiliary(next); saveDeviceSetting('auxiliary', next)
    const ranges = [...auxCalibration]; ranges[index] = undefined; setAuxCalibration(ranges); saveDeviceSetting('auxCalibration', ranges)
    setControllerArmed(false)
  }
  const captureAuxiliary = (index: number, point: 'min' | 'center' | 'max') => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex)
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
      const opened = hidControllers.current.find(controller => devices.includes(controller.device))
      preferredHid.current = opened?.index ?? null
      setControllerMessage('USB HID açıldı. Bir kolu oynat ve canlı girdilerin değiştiğini kontrol et.')
    } catch (error) { setControllerMessage(error instanceof Error ? `USB HID bağlantısı kurulamadı: ${error.message}` : 'USB HID bağlantısı kurulamadı.') }
  }
  const startWithoutCalibration = () => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex)
    if (!pad) { setControllerMessage('Uçuş için bağlı kumanda bulunamadı. USB cihazını seç veya HID bağlantısını dene.'); return }
    const prepared = prepareQuickFlight(pad, mapping, tuning, throttleReverseOverride)
    if (!prepared.ok) {
      setControllerArmed(false)
      setControllerMessage(prepared.message)
      return
    }
    setupProfile.current = null
    manualCalibrationDraft.current = {}
    setSetup(null)
    setDetectKey(null)
    setCalibration(prepared.calibration)
    setTuning(prepared.tuning)
    saveDeviceSetting('calibration', prepared.calibration)
    saveDeviceSetting('tuning', prepared.tuning)
    setSelectedPadIndex(pad.index)
    controls.current = { ...zero }
    setControllerArmed(true)
    setPaused(false)
    setShowSettings(false)
    setControllerMessage('Kalibrasyon sihirbazı olmadan uçuş başladı. Gaz sıfırı algılandı; eksen sırası farklıysa Kumanda ayarlarını aç.')
    simRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const advanceSetup = () => {
    const pad = choosePad(connectedPads(hidControllers.current), selectedPadIndex)
    if (!pad) { setControllerMessage('Bağlı kumanda yok. Cihazını seç veya USB HID bağlantısını kontrol et.'); return }
    if (!setup) {
      setupProfile.current = { mapping: { ...mapping }, calibration: {} }
      setControllerArmed(false)
      setDetectKey(null)
      setSetup({ index: 0, stage: 'neutral' })
      setControllerMessage('Önce ilgili kolu ortaya getir; gaz kolunu yarı konuma al. Sonra Ortayı kaydet düğmesine bas.')
      return
    }
    const profile = setupProfile.current
    if (!profile) { setControllerMessage('Kalibrasyon oturumu bulunamadı. Yeniden başlat.'); setSetup(null); return }
    const channel = flightChannels[setup.index]
    if (setup.stage === 'neutral') {
      if (!pad.axes.length || !pad.axes.some(Number.isFinite)) {
        setControllerMessage('Joystick sinyali alınmıyor. CANLI GİRDİLER bölümünü veya HID bağlantısını kontrol et.')
        return
      }
      setSetup({ index: setup.index, stage: 'positive', neutral: [...pad.axes] })
      setControllerMessage(`${channel.name}: kolu ${channel.positive} hareket ettirip Pozitif ucu kaydet düğmesine bas.`)
      return
    }
    if (!setup.neutral) { setControllerMessage('Önce orta konumu kaydet.'); setSetup({ index: setup.index, stage: 'neutral' }); return }
    if (setup.stage === 'positive') {
      const used = flightChannels.slice(0, setup.index).map(({ key }) => profile.mapping[key])
      const source = findGuidedAxis(setup.neutral, pad.axes, used)
      const positive = source ? readSource(pad, source) : undefined
      if (!source || !Number.isFinite(positive)) {
        setControllerMessage('Bu kola ait belirgin hareket bulunamadı. Önceki kolu bırakıp doğru kolu uçta tut; gerekirse Ortayı yeniden al ile baştan dene.')
        return
      }
      setSetup({ ...setup, stage: 'negative', source, positive })
      setControllerMessage(`${channel.name}: ${source} bulundu. Kolu tam karşı uca (${channel.negative}) getirip Negatif ucu kaydet düğmesine bas.`)
      return
    }
    const negative = setup.source ? readSource(pad, setup.source) : undefined
    const range = setup.source && setup.positive !== undefined && negative !== undefined
      ? guidedRange(channel.key, setup.source, setup.neutral, setup.positive, negative) : undefined
    if (!range || !setup.source) {
      setControllerMessage('Karşı uç veya orta nokta doğrulanamadı. Kolu sonuna kadar götür; olmuyorsa Ortayı yeniden al ile kol merkezdeyken tekrar başla.')
      return
    }
    profile.mapping[channel.key] = setup.source
    profile.calibration[channel.key] = range
    setControllerMessage('')
    if (setup.index < flightChannels.length - 1) {
      setSetup({ index: setup.index + 1, stage: 'neutral' })
      setControllerMessage('Bu kanal kaydedildi. Önceki kolu bırakıp sıradaki kolu ortaya getir (gaz için yarı konum). Sonra Ortayı kaydet.')
      return
    }
    const auxiliary = deviceSources(pad.axes.length, pad.buttons.length).filter(source => !Object.values(profile.mapping).includes(source))
    setMapping({ ...profile.mapping })
    setCalibration({ ...profile.calibration })
    setAuxiliary(auxiliary)
    setAuxReversed(auxiliary.map(() => false))
    setAuxCalibration(auxiliary.map(() => undefined))
    // Guided calibration must not silently reset the user's 'Ters' switches.
    saveDeviceSetting('mapping', profile.mapping)
    saveDeviceSetting('calibration', profile.calibration)
    saveDeviceSetting('auxiliary', auxiliary)
    saveDeviceSetting('auxReversed', auxiliary.map(() => false))
    saveDeviceSetting('auxCalibration', auxiliary.map(() => undefined))
    setupProfile.current = null
    setSetup(null)
    setControllerArmed(false)
    setControllerMessage('Dört kanal başarıyla kalibre edildi. Gazı rölantiye indirip Kumandayı etkinleştir düğmesine bas.')
  }
  const armController = () => {
    if (!flightChannels.every(({ key }) => validCalibration(calibration[key]))) {
      startWithoutCalibration()
      return
    }
    const pads = connectedPads(hidControllers.current)
    const pad = choosePad(pads, selectedPadIndex)
    if (!pad) { setControllerMessage('Bağlı kumanda bulunamadı.'); return }
    if (new Set(Object.values(mapping)).size !== 4 || !Object.values(mapping).every(source => Number.isFinite(readSource(pad, source)))) {
      setControllerMessage('Dört farklı ve okunabilir uçuş girdisi gerekli. Eksen eşlemesini kontrol et; kalibrasyon isteğe bağlıdır.')
      return
    }
    // Endpoint calibration is optional. Still require four distinct live signals,
    // centered flight controls and idle throttle before enabling the simulator.
    const { throttle, aileron, elevator, rudder } = gamepadControls(pad, mapping, tuning, calibration)
    if (throttle > .05) { setControllerMessage(`Gaz %${Math.round(throttle * 100)}. Gaz kanalını/yönünü ayarla ve kolu sıfıra indir.`); return }
    if (Math.max(Math.abs(aileron), Math.abs(elevator), Math.abs(rudder)) > .22) {
      setControllerMessage('Yatış, irtifa ve yön kollarını ortaya getir. Ortada durmasına rağmen değer yüksekse rehberli kalibrasyonu çalıştır.')
      return
    }
    controls.current = { ...zero }
    setSelectedPadIndex(pad.index)
    setControllerArmed(true)
    setPaused(false)
    setShowSettings(false)
    setControllerMessage('Kumanda etkinleştirildi. Uçuş başladı.')
    simRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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
    if (world) { setWorld(undefined); reset(vehicle, fieldIndex, undefined, null) }
    else clearLesson()
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
  const signal = axisSignalSummary(padAxes, axisTravel)
  const movedAxes = signal.moving
  const t12d = /t12d/i.test(padName)
  const livePreview = padAxes.length || padButtons.length
    ? gamepadControls({ axes: padAxes, buttons: padButtons.map(value => ({ value })) } as unknown as Gamepad, mapping, tuning, calibration)
    : null
  const field = world?.field ?? fields[fieldIndex]
  const coordinates = world?.terrain.coordinates(hud.position[0], -hud.position[2])
  const aircraft = hangarAircraft(vehicle)
  const retractable = hasRetractableGear(aircraft)
  const gearExtension = hud.gearPosition ?? 1
  const gearLabel = gearExtension > .975 ? 'Açık' : gearExtension < .025 ? 'Kapalı' : airframeConfig.gearDown ? 'Açılıyor' : 'Kapanıyor'
  return <main><header><div className="brand"><img className="brand-icon" src={`${import.meta.env.BASE_URL}flightsimrc.svg`} width="44" height="44" alt="" /><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● {roomStatus === 'connected' ? `ODA ${roomCode} · ${roomCount} PİLOT` : 'SOLO EĞİTİM'}</span><button onClick={() => setShowRoom(true)}>◎ Çok oyunculu</button><button onClick={() => { setShowSettings(!showSettings); setPaused(true); keys.current.clear() }}>⚙ Kumanda ayarları</button></nav></header>
    <section className="sim" ref={simRef}>
      <div className="simtop"><div>{aircraft.name} <span className="sep">/</span> {aircraft.category}</div>
        <button className="earth-launch" type="button" disabled={Boolean(roomCode)} onClick={() => { keys.current.clear(); setShowWorld(true) }}>Dünya haritası</button>
        <div className="flight-status">AGL {Math.round(Math.max(0, engine.state.agl))} m · Gaz %{Math.round(controls.current.throttle * 100)} · {padName.slice(0, 42)}{padName !== 'Klavye' && !controllerArmed ? ' · Kumanda ayarlarından etkinleştir' : ''}</div></div>
      <div className="viewport">
        <Suspense fallback={<div className="scene-loading" role="status">Uçuş alanı yükleniyor…</div>}>
          <FlightScene key={world?.key ?? 'practice'} state={flight} controls={controls} field={field} cameraMode={cameraMode} zoom={cameraZoom} vehicle={vehicle}
            world={world?.terrain} onImagery={setImagery} peers={peers.filter(pilot => pilot.field === fieldIndex)} />
        </Suspense>
        <div className="scene-label"><strong>{field.name}</strong><span>{coordinates
          ? [coordinates.latitude.toFixed(5), coordinates.longitude.toFixed(5)].join(', ')
          : field.weather.windSpeed.toFixed(1) + ' m/s · ' + field.weather.windDirection + '° · ' + field.runway.length + ' m pist'}</span></div>
        {world && imagery !== 'ready' && <span className="earth-status" role="status">{imagery === 'loading'
          ? 'Başlangıç arazisi yükleniyor…' : 'Başlangıç noktasında uydu görüntüsü yok.'}</span>}
        {cameraMode === 'onboard' && <div className="crosshair" aria-hidden="true">+</div>}
        {hud.crashed && <div className="crash"><strong>Uçuş sona erdi</strong><span>{engine.state.crashReason || 'Araç kaza yaptı.'}</span><button onClick={retry}>Yeniden başla</button></div>}
        {hud.stalled && !hud.crashed && <div className="flight-warning">STALL · BURNU İNDİR, HIZ KAZAN</div>}
        {deckVisible && <FlightDeck flight={hud} field={field} course={course} target={navTarget} maxSpeed={aircraft.envelope.maxSpeed} />}
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
        <label>EĞİTİM SAHASI <select value={world ? 'world' : fieldIndex} disabled={Boolean(roomCode)} onChange={e => {
          const nextField = Number(e.target.value)
          const nextVehicle = fields[nextField].runway.surface === 'water' ? 'float1200' : vehicle
          setFieldIndex(nextField)
          setCourse(fields[nextField].runway.heading)
          setNavTarget('runway')
          setVehicle(nextVehicle)
          setWorld(undefined)
          reset(nextVehicle, nextField, undefined, null)
        }}>
          {world && <option value="world" disabled>Dünya Keşfi</option>}
          {fields.map((entry, index) => <option value={index} key={entry.id}>{entry.name}</option>)}
        </select></label>
        <label className="assist-choice">UÇUŞ MODU <select value={assistMode} onChange={e => setAssistMode(e.target.value)}>
          <option value="model">Modele özel</option>
          {assistProfiles.map((profile, index) => <option key={index} value={String(index)}>{profile.label}</option>)}
        </select></label>
        <div>
          <button type="button" className="deck-toggle" aria-pressed={deckVisible} onClick={() => setDeckVisible(value => !value)}>{deckVisible ? 'Göstergeleri gizle' : 'Göstergeleri göster'}</button>
          <label className="camera-choice">GÖRÜŞ <select value={cameraMode} onChange={e => setCameraMode(e.target.value as CameraMode)}>
            <option value="chase">Takip</option><option value="pilot">RC pilot</option><option value="onboard">Araç üstü</option><option value="overview">Saha üstü</option><option value="inspect">Model inceleme</option>
          </select></label>
          <label className="camera-zoom">YAKINLIK <input type="range" min="0.65" max="2.2" step="0.05" value={cameraZoom} onChange={e => setCameraZoom(Number(e.target.value))} /></label>
          <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void simRef.current?.requestFullscreen() }}>Tam ekran</button>
          <button onClick={() => void toggleSound()}>{soundOn ? 'Sesi kapat' : 'Sesi aç'}</button>
          <button onClick={e => { setPaused(!paused); e.currentTarget.blur() }}>{paused ? 'Devam et' : 'Duraklat'}</button>
          <button onClick={e => { retry(); e.currentTarget.blur() }}>{lessonHud ? 'Dersi yeniden başlat' : 'Uçağı sıfırla'}</button>
        </div>
        {(aircraft.flaps || retractable) && <div className="configuration-controls">
          {aircraft.flaps && <label>FLAP (F)
            <select aria-label="Flap konumu" value={airframeConfig.flaps} onChange={event => commandFlaps(Number(event.target.value) as AirframeConfiguration['flaps'])}>
              {([0, .5, 1] as const).map(value => <option key={value} value={value}
                disabled={value > airframeConfig.flaps && hud.airspeed > (aircraft.flaps?.maxDeploySpeed ?? 0)}>
                {value === 0 ? 'Temiz' : value === .5 ? 'Yaklaşma' : 'İniş'} · {Math.round(value * (aircraft.flaps?.maxAngle ?? 0))}°
              </option>)}
            </select>
          </label>}
          {retractable && <button type="button" aria-pressed={airframeConfig.gearDown} onClick={event => { commandGear(); event.currentTarget.blur() }}>
            İniş takımı (G) · {gearLabel}
          </button>}
          {configMessage && <span role="status">{configMessage}</span>}
        </div>}
        {field.orthophoto && <a className="terrain-credit" href={field.orthophoto.source} target="_blank" rel="noreferrer">{field.orthophoto.credit}</a>}
        {world && <div className="earth-credit">
          <a href="https://cloudless.eox.at/" target="_blank" rel="noreferrer">{satelliteCredit}</a>
          <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen / AWS Terrain Tiles</a>
          <span><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></span>
        </div>}
        {deckVisible && <FlightNavigation flight={hud} field={field} course={course} onCourseChange={setCourse}
          target={navTarget} onTargetChange={setNavTarget} />}
      </div>
      {showWorld && <Suspense fallback={<div className="earth-picker" role="status">Dünya haritası açılıyor…</div>}>
        <WorldPicker initial={world?.start} onClose={closeWorld} onLaunch={launchWorld} />
      </Suspense>}
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
      <div><strong>KLAVYE</strong><p>W / S gaz, oklar yatış ve irtifa, A / D yatış, Q / E yön dümeni. Donanımlı modellerde F flap, G iniş takımı. Bir menüdeyken uçuşa dönmek için sahneye tıkla.</p></div>
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
    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">KUMANDA AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Bir düğmeye basarak cihazı tarayıcıda etkinleştir.</p><ControllerDiscovery pads={availablePads} selected={selectedPadIndex} onSelect={index => { setSetup(null); setSelectedPadIndex(index); setControllerArmed(false); setPaused(true) }} onMessage={setControllerMessage} /><button type="button" className="diagnostic-action" onClick={() => void requestHidController()}>USB HID kumandası bağla</button><button type="button" className="diagnostic-action" onClick={() => void copyControllerReport()}>Kumanda tanı bilgisini kopyala</button><p className="quick-flight-hint">Gazı tam rölantiye indir, yatış/irtifa/yön kollarını ortala. Kalibrasyon adımlarına gerek kalmadan uçuşa geç.</p><button type="button" className="account-action quick-flight" disabled={!availablePads.length || Boolean(setup)} onClick={startWithoutCalibration}>▶ Kalibrasyonsuz uçuşa başla (gaz sıfırdayken)</button><div className="setup-card">
      <strong>Kol testi · {signal.moving} hareketli / {signal.received} sinyal alınan / {signal.reported} bildirilen eksen</strong>
      <p>Her kolu yatay ve dikey yönde oynat. Canlı listede hareket eden eksen ve görülen aralık işaretlenir.</p>
      <button type="button" disabled={!padAxes.length} onClick={() => {
        travel.current = { axes: [], buttons: [] }
        setAxisTravel([])
        setControllerMessage('Kol testi sıfırlandı. Kolları tek tek tam uçtan uca oynat.')
      }}>Kol testini sıfırla</button>
      {t12d && movedAxes < 4 && <p>T12D: Windows joy.cpl ekranında da eksenler sabitse sorun site eşlemesi değildir. Kumandada MONITOR ekranında CH1–CH4 hareketini kontrol et; ardından TRAINER → STATE → INH, üreticinin joystick kalibrasyonu ve USB simülatör uyumlu firmware sürümünü doğrula. CH1–CH4 burada hareket ediyorsa fakat Windows ve WEBHID sabitse veri aktarımını üretici desteğiyle kontrol et.</p>}
      {signal.reported > 0 && signal.moving === 0 && <p role="status">Joystick hareketi henüz algılanmadı. Kol testini sıfırla, tüm kolları hareket ettir ve gerekirse USB HID kumandası bağla. Bu panel Windows/firmware kaynaklı eksik sinyali üretemez.</p>}
    </div><div className="axis-monitor">
      <div className="signal-panel-head">
        <strong>CANLI GİRDİLER · {padName.includes(' · HID ') ? 'WEBHID' : 'GAMEPAD'}</strong>
        <span>{padAxes.length} eksen / {padButtons.length} düğme</span>
      </div>
      <p className="signal-legend">Turuncu işaret canlı konum, yeşil alan ölçülen hareket aralığıdır. Ortadaki çizgi sıfırı gösterir.</p>
      {padAxes.length ? padAxes.map((value, i) =>
        <ControllerSignalRow key={`axis-${i}`} kind="axis" index={i} value={value} travel={axisTravel[i]} />
      ) : <p>Eksen görünmüyor.</p>}
      {padButtons.map((value, i) =>
        <ControllerSignalRow key={`button-${i}`} kind="button" index={i} value={value} />
      )}
    </div><div className="setup-card">
      {setup ? <>
        <strong>İsteğe bağlı kalibrasyon · {setup.index + 1} / 4 · {flightChannels[setup.index].name}</strong>
        <p>{setup.stage === 'neutral'
          ? 'Önceki kolu bırak, bu kolu ortaya getir (gaz için yarı konum) ve orta noktayı kaydet.'
          : setup.stage === 'positive'
            ? `Kolu ${flightChannels[setup.index].positive} hareket ettir, orada tut ve pozitif ucu kaydet.`
            : `Kolu ${flightChannels[setup.index].negative} hareket ettir, orada tut ve negatif ucu kaydet.`}</p>
        <button type="button" onClick={advanceSetup}>{setup.stage === 'neutral' ? 'Ortayı kaydet' : setup.stage === 'positive' ? 'Pozitif ucu kaydet' : 'Negatif ucu kaydet'}</button>
        {setup.stage !== 'neutral' && <button type="button" onClick={() => { setSetup({ index: setup.index, stage: 'neutral' }); setControllerMessage('Kolu orta konuma alıp tekrar dene.') }}>Ortayı yeniden al</button>}
        <button type="button" onClick={startWithoutCalibration}>Gaz rölantideyse kalibrasyonsuz uç</button>
      </> : <>
        <strong>Kalibrasyon isteğe bağlıdır</strong>
        <p>Gazı tam rölantiye indir ve diğer kolları ortaya getir. Kalibrasyonsuz uç düğmesi gaz yönünü ve merkezleri tek seferde tanıyıp uçuşu başlatır; uzun kalibrasyon gerekmez.</p>
        <button type="button" disabled={padAxes.filter(Number.isFinite).length < 4} onClick={advanceSetup}>İsteğe bağlı rehberli kalibrasyon</button>
        <button type="button" onClick={startWithoutCalibration}>Gaz rölantideyse kalibrasyonsuz uç</button>
      </>}
    </div><p className="muted">Tarayıcı bu cihazda {padAxes.length} eksen ve {padButtons.length} düğme bildiriyor. Panel, tarayıcının sunduğu {padAxes.length + padButtons.length} girdi için oluşur. Her girdi ayrı eşlenebilir.</p>{(Object.keys(mapping) as AxisKey[]).slice(0, Math.min(4, padAxes.length + padButtons.length)).map((key, index) => <div className="axis" key={key}><label htmlFor={`axis-${key}`}>{`Kanal ${index + 1} · ${key}`}</label><select id={`axis-${key}`} value={mapping[key]} onChange={e => updateMapping(key, e.target.value as InputSource)}>{sourceOptions(mapping[key])}</select><label className="reverse"><input type="checkbox" checked={tuning.reversed[key]} onChange={e => updateReverse(key, e.target.checked)} /> Ters</label><div className="calibration"><small className="channel-value" aria-live="off">{livePreview ? (key === 'throttle' ? `Çıkış %${Math.round(livePreview.throttle * 100)}` : `Çıkış ${livePreview[key].toFixed(2)}`) : 'Girdi bekleniyor'}</small><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(key)}>{detectKey === key ? 'Kolu oynat…' : 'Ekseni bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'max')}>Maks</button></div></div>)}{auxiliary.map((source, index) => <div className="axis" key={index}><label htmlFor={`aux-${index}`}>Kanal {index + 5} · yardımcı</label><select id={`aux-${index}`} value={source} onChange={e => updateAuxiliary(index, e.target.value as InputSource)}>{sourceOptions(source)}</select><label className="reverse"><input type="checkbox" checked={auxReversed[index]} onChange={e => { const next = [...auxReversed]; next[index] = e.target.checked; setAuxReversed(next); saveDeviceSetting('auxReversed', next) }} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(`aux:${index}`)}>{detectKey === `aux:${index}` ? 'Kolu oynat…' : 'Kanalı bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'max')}>Maks</button></div><small className="channel-value">{(() => { const raw = source.startsWith('axis:') ? padAxes[Number(source.slice(5))] : padButtons[Number(source.slice(7))] * 2 - 1; if (!Number.isFinite(raw)) return 'Girdi yok'; const range = auxCalibration[index]; const calibrated = calibrateAxis(raw, range); return `${((auxReversed[index] ? -1 : 1) * calibrated).toFixed(2)}` })()}</small></div>)}<p className="muted">Ters kutusunu değiştirip çubuğu oynatarak “Çıkış” değerini kontrol et. Gaz ters yönü uçuş güvenliği için yeniden sıfır gaz kontrolü gerektirir.</p><button type="button" className="diagnostic-action" onClick={resetThrottleReverse}>Gaz yönünü otomatik belirle</button><label className="tuning">Ölü bölge {Math.round(tuning.deadzone * 100)}%<input type="range" min="0" max="0.2" step="0.01" value={tuning.deadzone} onChange={e => updateTuning({ ...tuning, deadzone: Number(e.target.value) })} /></label><label className="tuning">Expo {Math.round(tuning.expo * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={tuning.expo} onChange={e => updateTuning({ ...tuning, expo: Number(e.target.value) })} /></label>{(['aileron', 'elevator', 'rudder'] as const).map(key => <label className="tuning" key={key}>{key} hızı · {Math.round((tuning.rates?.[key] ?? 1) * 100)}%<input type="range" min="0.5" max="2" step="0.05" value={tuning.rates?.[key] ?? 1} onChange={e => updateTuning({ ...tuning, rates: { ...defaultTuning.rates, ...tuning.rates, [key]: Number(e.target.value) } })} /></label>)}<button className="account-action" type="button" disabled={(!padAxes.length && !padButtons.length) || controllerArmed || Boolean(setup)} onClick={armController}>{controllerArmed ? 'Kumanda hazır' : 'Kumandayı etkinleştir'}</button>{controllerArmed && <button type="button" className="account-action" onClick={() => { setShowSettings(false); setPaused(false) }}>Ayarları kaydet ve uçuşa dön</button>}{controllerMessage && <p role="status">{controllerMessage}</p>}<p className="muted">İlk dört girdi uçuşu kontrol eder; sonraki girdiler izleme ve profil ayarları içindir. Kalibrasyon isteğe bağlıdır. Hızlı uçuş gaz yönünü rölanti konumundan güvenli biçimde belirler. Elle kalibrasyonda Min, Orta ve Maks konumlarının tümünü kaydetmeden değerler uygulanmaz. Gaz ekseninde Orta için kolu yarıya getir. Ayarlar cihaza özel saklanır; uçuşa geçmeden önce gaz yönünü ve sıfır gazı kontrol et.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
