import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { type Controls, type FlightState } from './flight'
import { calibrateAxis, defaultMapping, defaultTuning, defaultChannels, deviceSources, detectMovedSource, gamepadControls, normalizeSource, readSource, type Mapping, type InputSource, type AxisKey, type InputTuning, type Calibration } from './input'
import { VehicleModel } from './scene/Vehicles'
import { Airfield, airfields } from './scene/Airfield'
import { initialVehicle, stepVehicle, vehicles, type VehicleKind } from './vehicles'
import { EngineAudio } from './audio'
import { connectRoom, createRoomCode, normalizePilotName, normalizeRoomCode, roomTopic, type RemotePilot, type RoomPilot, type RoomState } from './multiplayer'
import { RemoteAircraft } from './scene/RemoteAircraft'
import './style.css'

const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
type CameraMode = 'chase' | 'pilot' | 'onboard'
function Aircraft({ state, controls, cameraMode, zoom, vehicle }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; cameraMode: CameraMode; zoom: number; vehicle: VehicleKind }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }, dt) => {
    const s = state.current
    if (!ref.current) return
    ref.current.position.set(...s.position)
    ref.current.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const chaseDistance = (vehicle === 'drone' ? 1.8 : vehicle === 'helicopter' ? 2.8 : 3.7) * zoom
    const chaseHeight = vehicle === 'drone' ? .65 : vehicle === 'helicopter' ? 1 : 1.25
    const attitude = new THREE.Euler(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(attitude)
    const desired = cameraMode === 'pilot'
      ? new THREE.Vector3(12, 1.8, -55)
      : cameraMode === 'onboard'
        ? new THREE.Vector3(...s.position).add(new THREE.Vector3(0, .22, .27).applyEuler(attitude))
      : new THREE.Vector3(s.position[0] - Math.sin(s.yaw) * chaseDistance, s.position[1] + chaseHeight, s.position[2] - Math.cos(s.yaw) * chaseDistance)
    camera.position.lerp(desired, cameraMode === 'onboard' ? 1 : 1 - Math.exp(-dt * (cameraMode === 'pilot' ? 6 : 4)))
    if (cameraMode === 'onboard') {
      camera.up.copy(new THREE.Vector3(0, 1, 0).applyEuler(attitude))
      camera.lookAt(desired.clone().addScaledVector(forward, 20))
    } else {
      camera.up.set(0, 1, 0)
      camera.lookAt(s.position[0] + (cameraMode === 'pilot' ? 0 : Math.sin(s.yaw) * .6), s.position[1] + (cameraMode === 'pilot' ? 0 : .15), s.position[2] + (cameraMode === 'pilot' ? 0 : Math.cos(s.yaw) * .6))
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = cameraMode === 'pilot' ? 58 / zoom : cameraMode === 'onboard' ? 75 : 58
      if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix() }
    }
  })
  return <group ref={ref}><VehicleModel kind={vehicle} controls={controls} /></group>
}
function Scene({ state, controls, field, cameraMode, zoom, vehicle, peers }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; field: typeof airfields[number]; cameraMode: CameraMode; zoom: number; vehicle: VehicleKind; peers: RemotePilot[] }) {
  return <Canvas camera={{ position: [0, 1.4, -4], fov: 58, near: .025, far: 800 }} dpr={[1, 1.6]} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
    <Airfield field={field} /><Aircraft state={state} controls={controls} cameraMode={cameraMode} zoom={zoom} vehicle={vehicle} />
    {peers.map(pilot => <RemoteAircraft key={pilot.id} pilot={pilot} />)}
  </Canvas>
}
function ControllerDiscovery({ pads, selected, onSelect, onMessage }: {
  pads: { index: number; id: string; axes: number; buttons: number }[]
  selected: number | null
  onSelect: (index: number | null) => void
  onMessage: (message: string) => void
}) {
  if (pads.length) return <label className="email-field">Uçuş kumandası
    <select value={selected ?? 'auto'} onChange={e => onSelect(e.target.value === 'auto' ? null : Number(e.target.value))}>
      <option value="auto">İlk bağlanan cihazı seç</option>
      {pads.map(p => <option key={p.index} value={p.index}>{p.id.slice(0, 50)} · {p.axes} eksen / {p.buttons} düğme</option>)}
    </select>
  </label>
  return <div className="device-help"><strong>Tarayıcı kumanda görmüyor</strong>
    <p>Kumandayı veya joystick'i bilgisayara veri taşıyan USB kablosuyla bağla. Gerekliyse cihazın simülatör/gamepad kipini aç. Windows oyun kumandaları ekranında eksenler hareket etmiyorsa tarayıcı da okuyamaz.</p>
    <button type="button" onClick={() => {
      try {
        const count = [...(navigator.getGamepads?.() || [])].filter(Boolean).length
        onMessage(count ? `${count} kumanda bulundu. Listeden seç.` : 'Tarayıcı hâlâ oyun kumandası görmüyor. T12D simülatör kipini ve Windows oyun kumandaları ekranını kontrol et.')
      } catch { onMessage('Tarayıcı Gamepad erişimine izin vermiyor.') }
    }}>Cihazları yeniden tara</button>
  </div>
}
function App() {
  const simRef = useRef<HTMLElement>(null)
  const [vehicle, setVehicle] = useState<VehicleKind>('trainer')
  const flight = useRef(initialVehicle('trainer'))
  const sound = useRef<EngineAudio | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const controls = useRef<Controls>({ ...zero })
  const keys = useRef(new Set<string>())
  const [hud, setHud] = useState(initialVehicle('trainer'))
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
  const flightSeconds = useRef(0)
  useEffect(() => {
    if (!roomCode || !roomChannel) return
    setRoomStatus('connecting')
    const disconnect = connectRoom({
      code: roomCode, topic: roomChannel, id: pilotId.current, name: pilotName, isHost: roomIsHost,
      getFlight: () => ({ state: flight.current, vehicle: roomFlight.current.vehicle, field: roomFlight.current.fieldIndex }),
      onStatus: (status, message) => { setRoomStatus(status); if (message) setRoomMessage(message) },
      onPeers: (remote, count) => { setPeers(remote); setRoomCount(count) },
      onRoster: setRoomPilots,
      onField: field => { if (field !== roomFlight.current.fieldIndex) { setFieldIndex(field); flight.current = initialVehicle(roomFlight.current.vehicle); flightSeconds.current = 0 } },
    })
    return disconnect
  }, [roomCode, roomChannel, roomIsHost])
  useEffect(() => {
    if (!detectKey) return
    const timer = window.setTimeout(() => { setDetectKey(null); setControllerMessage('Eksen hareketi algılanmadı. Kolu daha geniş hareket ettirip tekrar dene.') }, 8000)
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
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  useEffect(() => {
    let frame = 0, last = performance.now(), accumulator = 0, display = 0
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1); last = now
      let pads: Gamepad[] = []
      try { pads = [...(navigator.getGamepads?.() || [])].filter((p): p is Gamepad => Boolean(p?.connected)) } catch { pads = [] }
      if (selectedPadIndex !== null && !pads.some(p => p.index === selectedPadIndex)) setSelectedPadIndex(null)
      const pad = selectedPadIndex === null ? pads[0] : pads.find(p => p.index === selectedPadIndex)
      setAvailablePads(previous => {
        const next = pads.map(p => ({ index: p.index, id: p.id, axes: p.axes.length, buttons: p.buttons.length }))
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next
      })
      setPadName(previous => { const next = pad?.id || (selectedPadIndex === null ? 'Klavye' : 'Seçili kumanda bağlı değil'); return previous === next ? previous : next })
      const deviceKey = pad ? `${pad.index}:${pad.id}:${pad.axes.length}:${pad.buttons.length}` : ''
      if (deviceKey !== activeDevice.current) {
        activeDevice.current = deviceKey
        deviceProfileId.current = pad?.id ?? ''
        setControllerArmed(false)
        if (pad) { setPaused(true); setShowSettings(true); setControllerMessage('Önce kanalları kontrol et; gaz sıfırdayken kumandayı etkinleştir.') }
        const prefix = `flight-device:${deviceProfileId.current}:`
        if (pad) {
          const defaults = defaultChannels(pad.axes.length, pad.buttons.length)
          try {
            const savedMapping = JSON.parse(localStorage.getItem(prefix + 'mapping') || 'null')
            const savedTuning = JSON.parse(localStorage.getItem(prefix + 'tuning') || 'null')
            const savedCalibration = JSON.parse(localStorage.getItem(prefix + 'calibration') || '{}')
            setMapping(Object.fromEntries((Object.keys(defaults.mapping) as AxisKey[]).map(key => [key, normalizeSource(savedMapping?.[key], defaults.mapping[key])])) as Mapping)
            const savedAuxiliary = JSON.parse(localStorage.getItem(prefix + 'auxiliary') || 'null')
            setAuxiliary(defaults.auxiliary.map((source, index) => normalizeSource(savedAuxiliary?.[index], source)))
            const savedAuxReversed = JSON.parse(localStorage.getItem(prefix + 'auxReversed') || 'null')
            setAuxReversed(defaults.auxiliary.map((_, index) => savedAuxReversed?.[index] === true))
            const savedAuxCalibration = JSON.parse(localStorage.getItem(prefix + 'auxCalibration') || 'null')
            setAuxCalibration(defaults.auxiliary.map((_, index) => savedAuxCalibration?.[index]))
            setTuning(savedTuning ? { ...defaultTuning, ...savedTuning, reversed: { ...defaultTuning.reversed, ...savedTuning.reversed } } : defaultTuning)
            setCalibration(savedCalibration)
          } catch { setMapping(defaults.mapping); setAuxiliary(defaults.auxiliary); setAuxReversed(defaults.auxiliary.map(() => false)); setAuxCalibration(defaults.auxiliary.map(() => undefined)); setTuning(defaultTuning); setCalibration({}) }
        }
        controls.current = { ...zero }
      }
      if (pad) {
        const target = controllerArmed ? gamepadControls(pad, mapping, tuning, calibration) : zero
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
      if (!paused) { accumulator += delta; while (accumulator >= 1 / 60) { flight.current = stepVehicle(vehicle, flight.current, controls.current, 1 / 60, airfields[fieldIndex].wind); if (!flight.current.crashed) flightSeconds.current += 1 / 60; accumulator -= 1 / 60 } }
      sound.current?.update(vehicle, controls.current.throttle, flight.current.airspeed, paused || flight.current.crashed)
      if (now - display > 100) { setHud({ ...flight.current }); setPadAxes(pad ? [...pad.axes] : []); setPadButtons(pad ? pad.buttons.map(button => button.value) : []); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [calibration, controllerArmed, fieldIndex, mapping, selectedPadIndex, tuning, paused, vehicle])
  const reset = (kind: VehicleKind = vehicle) => { flight.current = initialVehicle(kind); flightSeconds.current = 0; controls.current = { ...zero }; setHud(flight.current) }
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
  const captureCalibration = (key: AxisKey, point: 'min' | 'center' | 'max') => {
    const pad = navigator.getGamepads?.()[selectedPadIndex ?? availablePads[0]?.index]
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
    const pad = navigator.getGamepads?.()[selectedPadIndex ?? availablePads[0]?.index]
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
    const pads = [...(navigator.getGamepads?.() || [])].filter((pad): pad is Gamepad => Boolean(pad?.connected))
    const report = pads.length
      ? pads.map(pad => `${pad.id} | index ${pad.index} | mapping ${pad.mapping || 'yok'} | ${pad.axes.length} eksen, ${pad.buttons.length} düğme\nEksenler: ${pad.axes.map(value => value.toFixed(2)).join(', ')}\nDüğmeler: ${pad.buttons.map(button => button.value.toFixed(2)).join(', ')}`).join('\n\n')
      : 'Tarayıcı bağlı Gamepad cihazı bildirmiyor.'
    try { await navigator.clipboard.writeText(report); setControllerMessage('Kumanda tanı bilgisi kopyalandı. Bağlantı sorununu incelemek için paylaşabilirsin.') }
    catch { setControllerMessage(report) }
  }
  const armController = () => {
    const pads = [...(navigator.getGamepads?.() || [])].filter((p): p is Gamepad => Boolean(p?.connected))
    const pad = selectedPadIndex === null ? pads[0] : pads.find(p => p.index === selectedPadIndex)
    if (!pad) { setControllerMessage('Bağlı kumanda bulunamadı.'); return }
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
  const speed = hud.airspeed
  const bank = Math.round(hud.roll * 180 / Math.PI)
  const pitch = Math.round(hud.pitch * 180 / Math.PI)
  return <main><header><div className="brand"><span className="mark">✦</span><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● {roomStatus === 'connected' ? `ODA ${roomCode} · ${roomCount} PİLOT` : 'SOLO EĞİTİM'}</span><button onClick={() => setShowRoom(true)}>◎ Çok oyunculu</button><button onClick={() => { setShowSettings(!showSettings); setPaused(true); keys.current.clear() }}>⚙ Kumanda ayarları</button></nav></header>
    <section className="intro"><div><p className="eyebrow">RC PİLOTLUĞA İLK ADIM</p><h1>Uçuşu hisset.<br/><em>Kontrolü öğren.</em></h1><p>Pervaneli trainer, drone, helikopter veya RC jet seç. Kumandanı bağla ya da klavyeyle eğitime başla.</p></div><div className="lesson"><span>01 / TEMEL EĞİTİM</span><strong>{vehicles.find(item => item.id === vehicle)?.className}</strong><p>{vehicles.find(item => item.id === vehicle)?.lesson}. Gazı dikkatle artır; sert inişte aracı sıfırla.</p></div></section>
    <section className="sim" ref={simRef}><div className="simtop"><div><span className="red-dot">●</span> CANLI SİMÜLATÖR <span className="sep">/</span> {vehicles.find(item => item.id === vehicle)?.name.toUpperCase()}</div><div>{padName.slice(0, 42)} bağlı</div></div><div className="viewport"><Scene state={flight} controls={controls} field={airfields[fieldIndex]} cameraMode={cameraMode} zoom={cameraZoom} vehicle={vehicle} peers={peers} />{hud.crashed && <div className="crash"><strong>Sert iniş</strong><span>Yeni uçuş için sıfırla</span><button onClick={() => reset()}>Yeniden başla</button></div>}<div className="crosshair">+</div><div className="scene-label"><strong>{airfields[fieldIndex].name}</strong><span>{airfields[fieldIndex].subtitle} · {Math.abs(airfields[fieldIndex].wind).toFixed(1)} m/s yan rüzgâr</span></div>{hud.stalled && !hud.crashed && <div className="flight-warning">STALL · BURNU İNDİR, HIZ KAZAN</div>}<div className="attitude"><span>YATIŞ {bank}°</span><span>BURUN {pitch}°</span><span>ALFA {Math.round(hud.angleOfAttack * 180 / Math.PI)}°</span></div><div className="hud"><div><small>HAVA HIZI</small><strong>{Math.round(speed * 3.6)}</strong><span>km/sa</span></div><div><small>İRTİFA</small><strong>{Math.round(Math.max(0, hud.position[1] - .25))}</strong><span>m</span></div><div><small>GAZ</small><strong>{Math.round(controls.current.throttle * 100)}</strong><span>%</span></div><div><small>BAŞ</small><strong>{Math.round((hud.yaw * 180 / Math.PI + 3600) % 360)}</strong><span>°</span></div></div></div><div className="toolbar"><label>MODEL <select value={vehicle} onChange={e => { const next = e.target.value as VehicleKind; setVehicle(next); reset(next) }}>{vehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.className}</option>)}</select></label><label>UÇUŞ ALANI <select value={fieldIndex} disabled={Boolean(roomCode)} onChange={e => { setFieldIndex(Number(e.target.value)); reset() }}>{airfields.map((f, i) => <option value={i} key={f.name}>{f.name}</option>)}</select></label><div><label className="camera-choice">GÖRÜŞ <select value={cameraMode} onChange={e => setCameraMode(e.target.value as CameraMode)}><option value="chase">Takip</option><option value="pilot">RC pilot</option><option value="onboard">Araç üstü</option></select></label><label className="camera-zoom">YAKINLIK <input type="range" min="0.6" max="2.4" step="0.1" value={cameraZoom} onChange={e => setCameraZoom(Number(e.target.value))} /></label><button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void simRef.current?.requestFullscreen() }}>⛶ Tam ekran</button><button onClick={() => void toggleSound()}>{soundOn ? '◖ Sesi kapat' : '◖ Sesi aç'}</button><button onClick={() => setPaused(!paused)}>{paused ? '▶ Devam' : 'Ⅱ Duraklat'}</button><button onClick={() => reset()}>↺ Uçağı sıfırla</button></div></div></section>
    <section className="info"><div><span>01</span><strong>KLAVYE</strong><p>W / S gaz · Oklar pitch ve roll · A / D roll · Q / E dümen. Drone ve helikopterde yaklaşık %50 gaz hover bölgesidir.</p></div><div><span>02</span><strong>RC KUMANDA / JOYSTICK</strong><p>USB cihazını bağla. Gamepad API üzerinden otomatik algılanır; kanal eşlemesini ayarlardan değiştir.</p></div><div><span>03</span><strong>ARAÇ DİNAMİĞİ</strong><p>Trainer ve jet için ayrı sabit kanat profilleri; drone ve helikopter için stabilize edilmiş rotor tepkisi. Modeller uçuş verileriyle kalibre edilmeli.</p></div></section>
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
    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">KUMANDA AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Bir düğmeye basarak cihazı tarayıcıda etkinleştir.</p><ControllerDiscovery pads={availablePads} selected={selectedPadIndex} onSelect={index => { setSelectedPadIndex(index); setControllerArmed(false); setPaused(true) }} onMessage={setControllerMessage} /><button type="button" className="diagnostic-action" onClick={() => void copyControllerReport()}>Kumanda tanı bilgisini kopyala</button><p className="muted">Tarayıcı bu cihazda {padAxes.length} eksen ve {padButtons.length} düğme bildiriyor. Panel, tarayıcının sunduğu {padAxes.length + padButtons.length} girdi için oluşur. Her girdi ayrı eşlenebilir.</p>{(Object.keys(mapping) as AxisKey[]).slice(0, Math.min(4, padAxes.length + padButtons.length)).map((key, index) => <div className="axis" key={key}><label htmlFor={`axis-${key}`}>{`Kanal ${index + 1} · ${key}`}</label><select id={`axis-${key}`} value={mapping[key]} onChange={e => updateMapping(key, e.target.value as InputSource)}>{sourceOptions(mapping[key])}</select><label className="reverse"><input type="checkbox" checked={tuning.reversed[key]} onChange={e => updateTuning({ ...tuning, reversed: { ...tuning.reversed, [key]: e.target.checked } })} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(key)}>{detectKey === key ? 'Kolu oynat…' : 'Ekseni bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureCalibration(key, 'max')}>Maks</button></div></div>)}{auxiliary.map((source, index) => <div className="axis" key={index}><label htmlFor={`aux-${index}`}>Kanal {index + 5} · yardımcı</label><select id={`aux-${index}`} value={source} onChange={e => updateAuxiliary(index, e.target.value as InputSource)}>{sourceOptions(source)}</select><label className="reverse"><input type="checkbox" checked={auxReversed[index]} onChange={e => { const next = [...auxReversed]; next[index] = e.target.checked; setAuxReversed(next); saveDeviceSetting('auxReversed', next) }} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => beginAxisDetection(`aux:${index}`)}>{detectKey === `aux:${index}` ? 'Kolu oynat…' : 'Kanalı bul'}</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'min')}>Min</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'center')}>Orta</button><button type="button" disabled={!padAxes.length && !padButtons.length} onClick={() => captureAuxiliary(index, 'max')}>Maks</button></div><small className="channel-value">{(() => { const raw = source.startsWith('axis:') ? padAxes[Number(source.slice(5))] : padButtons[Number(source.slice(7))] * 2 - 1; if (!Number.isFinite(raw)) return 'Girdi yok'; const range = auxCalibration[index]; const calibrated = calibrateAxis(raw, range); return `${((auxReversed[index] ? -1 : 1) * calibrated).toFixed(2)}` })()}</small></div>)}<label className="tuning">Ölü bölge {Math.round(tuning.deadzone * 100)}%<input type="range" min="0" max="0.2" step="0.01" value={tuning.deadzone} onChange={e => updateTuning({ ...tuning, deadzone: Number(e.target.value) })} /></label><label className="tuning">Expo {Math.round(tuning.expo * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={tuning.expo} onChange={e => updateTuning({ ...tuning, expo: Number(e.target.value) })} /></label><button className="account-action" type="button" disabled={(!padAxes.length && !padButtons.length) || controllerArmed} onClick={armController}>{controllerArmed ? 'Kumanda hazır' : 'Kumandayı etkinleştir'}</button>{controllerMessage && <p role="status">{controllerMessage}</p>}<div className="axis-monitor"><strong>CANLI GİRDİLER · {padAxes.length} EKSEN / {padButtons.length} DÜĞME</strong>{padAxes.length ? padAxes.map((value, i) => <div key={i}>Eksen {i + 1}<meter min={-1} max={1} value={value} />{value.toFixed(2)}</div>) : <p>Eksen görünmüyor.</p>}{padButtons.map((value, i) => <div key={`button-${i}`}>Düğme {i + 1}<meter min={0} max={1} value={value} />{value.toFixed(2)}</div>)}</div><p className="muted">İlk dört girdi uçuşu kontrol eder; sonraki girdiler izleme ve profil ayarları içindir. Her kanal için kolu en düşük, orta ve en yüksek konuma getirip ilgili düğmeye bas. Gaz ekseninde orta için kolu yarıya getir. Ayarlar bağlı cihaza özel saklanır. Kalibrasyondan sonra gaz yönünü ve sıfır gazı kontrol et.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)






