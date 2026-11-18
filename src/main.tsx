import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { type Controls, type FlightState } from './flight'
import { defaultMapping, defaultTuning, gamepadControls, type Mapping, type AxisKey, type InputTuning, type Calibration } from './input'
import { VehicleModel } from './scene/Vehicles'
import { Airfield, airfields } from './scene/Airfield'
import { initialVehicle, stepVehicle, vehicles, type VehicleKind } from './vehicles'
import { EngineAudio } from './audio'
import { cloud } from './cloud'
import type { User } from '@supabase/supabase-js'
import './style.css'

const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
function Aircraft({ state, controls, cameraMode, vehicle }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; cameraMode: 'chase' | 'pilot'; vehicle: VehicleKind }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const s = state.current
    if (!ref.current) return
    ref.current.position.set(...s.position)
    ref.current.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const chaseDistance = vehicle === 'drone' ? 1.8 : vehicle === 'helicopter' ? 2.8 : 3.7
    const chaseHeight = vehicle === 'drone' ? .65 : vehicle === 'helicopter' ? 1 : 1.25
    const desired = cameraMode === 'pilot'
      ? new THREE.Vector3(12, 1.8, -55)
      : new THREE.Vector3(s.position[0] - Math.sin(s.yaw) * chaseDistance, s.position[1] + chaseHeight, s.position[2] - Math.cos(s.yaw) * chaseDistance)
    camera.position.lerp(desired, cameraMode === 'pilot' ? .1 : .07)
    camera.lookAt(s.position[0], s.position[1] + (cameraMode === 'pilot' ? 0 : .15), s.position[2] + (cameraMode === 'pilot' ? 0 : 2))
  })
  return <group ref={ref}><VehicleModel kind={vehicle} controls={controls} /></group>
}
function Scene({ state, controls, field, cameraMode, vehicle }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; field: typeof airfields[number]; cameraMode: 'chase' | 'pilot'; vehicle: VehicleKind }) {
  return <Canvas camera={{ position: [0, 1.4, -4], fov: 58, near: .025, far: 800 }} dpr={[1, 1.6]} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
    <Airfield field={field} /><Aircraft state={state} controls={controls} cameraMode={cameraMode} vehicle={vehicle} />
  </Canvas>
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
  const [mapping, setMapping] = useState<Mapping>(() => { try { return { ...defaultMapping, ...JSON.parse(localStorage.getItem('flight-mapping') || '{}') } } catch { return defaultMapping } })
  const [tuning, setTuning] = useState<InputTuning>(() => { try { const saved = JSON.parse(localStorage.getItem('flight-tuning') || '{}'); return { ...defaultTuning, ...saved, reversed: { ...defaultTuning.reversed, ...saved.reversed } } } catch { return defaultTuning } })
  const [padAxes, setPadAxes] = useState<number[]>([])
  const [padName, setPadName] = useState('Klavye')
  const [calibration, setCalibration] = useState<Calibration>({})
  const activeDevice = useRef('')
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] = useState<'chase' | 'pilot'>('chase')
  const [showSettings, setShowSettings] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [accountMessage, setAccountMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const flightSeconds = useRef(0)
  useEffect(() => {
    if (!cloud) return
    void cloud.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = cloud.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
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
      let pad: Gamepad | null | undefined
      try { pad = navigator.getGamepads?.().find(Boolean) } catch { pad = null }
      setPadName(previous => { const next = pad?.id || 'Klavye'; return previous === next ? previous : next })
      if (pad?.id !== activeDevice.current) {
        activeDevice.current = pad?.id ?? ''
        const prefix = `flight-device:${activeDevice.current}:`
        if (pad) {
          try {
            const savedMapping = JSON.parse(localStorage.getItem(prefix + 'mapping') || 'null')
            const savedTuning = JSON.parse(localStorage.getItem(prefix + 'tuning') || 'null')
            const savedCalibration = JSON.parse(localStorage.getItem(prefix + 'calibration') || '{}')
            setMapping(savedMapping ? { ...defaultMapping, ...savedMapping } : defaultMapping)
            setTuning(savedTuning ? { ...defaultTuning, ...savedTuning, reversed: { ...defaultTuning.reversed, ...savedTuning.reversed } } : defaultTuning)
            setCalibration(savedCalibration)
          } catch { setMapping(defaultMapping); setTuning(defaultTuning); setCalibration({}) }
        }
        controls.current = { ...zero }
      }
      if (pad) controls.current = gamepadControls(pad, mapping, tuning, calibration)
      else {
        const k = keys.current
        controls.current = { throttle: Math.max(0, Math.min(1, controls.current.throttle + ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * delta * 0.35)), aileron: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), elevator: (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0), rudder: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) }
      }
      if (!paused) { accumulator += delta; while (accumulator >= 1 / 60) { flight.current = stepVehicle(vehicle, flight.current, controls.current, 1 / 60, airfields[fieldIndex].wind); if (!flight.current.crashed) flightSeconds.current += 1 / 60; accumulator -= 1 / 60 } }
      sound.current?.update(vehicle, controls.current.throttle, flight.current.airspeed, paused || flight.current.crashed)
      if (now - display > 100) { setHud({ ...flight.current }); setPadAxes(pad ? [...pad.axes] : []); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [calibration, fieldIndex, mapping, tuning, paused, vehicle])
  const reset = (kind: VehicleKind = vehicle) => { flight.current = initialVehicle(kind); flightSeconds.current = 0; controls.current = { ...zero }; setHud(flight.current) }
  const requestLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cloud) return
    const { error } = await cloud.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
    setAccountMessage(error ? error.message : 'Giriş bağlantısı e-posta adresine gönderildi.')
  }
  const saveFlight = async () => {
    if (!cloud) { setAccountMessage('Bulut bağlantısı henüz yapılandırılmadı.'); setShowAccount(true); return }
    const { data: { user: currentUser }, error: authError } = await cloud.auth.getUser()
    if (authError || !currentUser) { setAccountMessage('Uçuşu kaydetmek için giriş yap.'); setShowAccount(true); return }
    const duration = Math.floor(flightSeconds.current)
    if (duration < 10) { setAccountMessage('Kayıt için en az 10 saniye uçuş yap.'); setShowAccount(true); return }
    const { error } = await cloud.from('training_flights').insert({ user_id: currentUser.id, airfield: airfields[fieldIndex].name, vehicle, duration_seconds: duration })
    setAccountMessage(error ? `Kayıt yapılamadı: ${error.message}` : `${duration} saniyelik uçuş kaydedildi.`)
    setShowAccount(true)
  }
  const toggleSound = async () => { if (sound.current) { await sound.current.close(); sound.current = null; setSoundOn(false) } else { sound.current = new EngineAudio(); await sound.current.resume(); setSoundOn(true) } }
  const saveDeviceSetting = (name: string, value: unknown) => { if (activeDevice.current) localStorage.setItem(`flight-device:${activeDevice.current}:${name}`, JSON.stringify(value)) }
  const updateMapping = (key: AxisKey, axis: number) => { const next = { ...mapping, [key]: axis }; setMapping(next); saveDeviceSetting('mapping', next) }
  const updateTuning = (next: InputTuning) => { setTuning(next); saveDeviceSetting('tuning', next) }
  const captureCalibration = (key: AxisKey, point: 'min' | 'center' | 'max') => {
    const raw = padAxes[mapping[key]]
    if (raw === undefined) return
    const next = { ...calibration, [key]: { min: -1, center: 0, max: 1, ...calibration[key], [point]: raw } }
    setCalibration(next); saveDeviceSetting('calibration', next)
  }
  const speed = hud.airspeed
  const bank = Math.round(hud.roll * 180 / Math.PI)
  const pitch = Math.round(hud.pitch * 180 / Math.PI)
  return <main><header><div className="brand"><span className="mark">✦</span><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● SOLO EĞİTİM</span><button onClick={() => setShowAccount(true)}>{user ? '◉ Hesabım' : '◉ Giriş yap'}</button><button onClick={() => { setShowSettings(!showSettings); setPaused(true); keys.current.clear() }}>⚙ Kumanda ayarları</button></nav></header>
    <section className="intro"><div><p className="eyebrow">RC PİLOTLUĞA İLK ADIM</p><h1>Uçuşu hisset.<br/><em>Kontrolü öğren.</em></h1><p>Pervaneli trainer, drone, helikopter veya RC jet seç. Kumandanı bağla ya da klavyeyle eğitime başla.</p></div><div className="lesson"><span>01 / TEMEL EĞİTİM</span><strong>{vehicles.find(item => item.id === vehicle)?.className}</strong><p>{vehicles.find(item => item.id === vehicle)?.lesson}. Gazı dikkatle artır; sert inişte aracı sıfırla.</p></div></section>
    <section className="sim" ref={simRef}><div className="simtop"><div><span className="red-dot">●</span> CANLI SİMÜLATÖR <span className="sep">/</span> {vehicles.find(item => item.id === vehicle)?.name.toUpperCase()}</div><div>{padName.slice(0, 42)} bağlı</div></div><div className="viewport"><Scene state={flight} controls={controls} field={airfields[fieldIndex]} cameraMode={cameraMode} vehicle={vehicle} />{hud.crashed && <div className="crash"><strong>Sert iniş</strong><span>Yeni uçuş için sıfırla</span><button onClick={() => reset()}>Yeniden başla</button></div>}<div className="crosshair">+</div><div className="scene-label"><strong>{airfields[fieldIndex].name}</strong><span>{airfields[fieldIndex].subtitle} · {Math.abs(airfields[fieldIndex].wind).toFixed(1)} m/s yan rüzgâr</span></div>{hud.stalled && !hud.crashed && <div className="flight-warning">STALL · BURNU İNDİR, HIZ KAZAN</div>}<div className="attitude"><span>YATIŞ {bank}°</span><span>BURUN {pitch}°</span><span>ALFA {Math.round(hud.angleOfAttack * 180 / Math.PI)}°</span></div><div className="hud"><div><small>HAVA HIZI</small><strong>{Math.round(speed * 3.6)}</strong><span>km/sa</span></div><div><small>İRTİFA</small><strong>{Math.round(Math.max(0, hud.position[1] - .25))}</strong><span>m</span></div><div><small>GAZ</small><strong>{Math.round(controls.current.throttle * 100)}</strong><span>%</span></div><div><small>BAŞ</small><strong>{Math.round((hud.yaw * 180 / Math.PI + 3600) % 360)}</strong><span>°</span></div></div></div><div className="toolbar"><label>MODEL <select value={vehicle} onChange={e => { const next = e.target.value as VehicleKind; setVehicle(next); reset(next) }}>{vehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.className}</option>)}</select></label><label>UÇUŞ ALANI <select value={fieldIndex} onChange={e => { setFieldIndex(Number(e.target.value)); reset() }}>{airfields.map((f, i) => <option value={i} key={f.name}>{f.name}</option>)}</select></label><div><button onClick={() => setCameraMode(cameraMode === 'chase' ? 'pilot' : 'chase')}>{cameraMode === 'chase' ? '◉ Pilot görüşü' : '◉ Takip görüşü'}</button><button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void simRef.current?.requestFullscreen() }}>⛶ Tam ekran</button><button onClick={() => void toggleSound()}>{soundOn ? '◖ Sesi kapat' : '◖ Sesi aç'}</button><button onClick={() => setPaused(!paused)}>{paused ? '▶ Devam' : 'Ⅱ Duraklat'}</button><button onClick={() => void saveFlight()}>▣ Uçuşu kaydet</button><button onClick={() => reset()}>↺ Uçağı sıfırla</button></div></div></section>
    <section className="info"><div><span>01</span><strong>KLAVYE</strong><p>W / S gaz · Oklar pitch ve roll · A / D roll · Q / E dümen. Drone ve helikopterde yaklaşık %50 gaz hover bölgesidir.</p></div><div><span>02</span><strong>RC KUMANDA / JOYSTICK</strong><p>USB cihazını bağla. Gamepad API üzerinden otomatik algılanır; kanal eşlemesini ayarlardan değiştir.</p></div><div><span>03</span><strong>ARAÇ DİNAMİĞİ</strong><p>Trainer ve jet için ayrı sabit kanat profilleri; drone ve helikopter için stabilize edilmiş rotor tepkisi. Modeller uçuş verileriyle kalibre edilmeli.</p></div></section>
    {showAccount && <div className="overlay" onClick={() => setShowAccount(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowAccount(false)}>✕</button><p className="eyebrow">PİLOT HESABI</p><h2>{user ? 'Pilot hesabı' : 'Giriş yap'}</h2>{user ? <><p>{user.email} ile giriş yapıldı. Uçuşu kaydet düğmesiyle eğitim uçuşunu hesabına ekleyebilirsin.</p><button className="account-action" onClick={() => { void cloud?.auth.signOut(); setAccountMessage('Oturum kapatıldı.') }}>Çıkış yap</button></> : <form onSubmit={event => void requestLogin(event)}><p>E-posta adresine tek kullanımlık giriş bağlantısı gönderilir.</p><label className="email-field">E-posta<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><button className="account-action" disabled={!cloud}>Giriş bağlantısı gönder</button></form>}{accountMessage && <p role="status">{accountMessage}</p>}</aside></div>}    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">GİRİŞ AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Bir düğmeye basarak cihazı tarayıcıda etkinleştir.</p>{(Object.keys(mapping) as AxisKey[]).map(key => <div className="axis" key={key}><label htmlFor={`axis-${key}`}>{key}</label><select id={`axis-${key}`} value={mapping[key]} onChange={e => updateMapping(key, Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => <option value={i} key={i}>Eksen {i}</option>)}</select><label className="reverse"><input type="checkbox" checked={tuning.reversed[key]} onChange={e => updateTuning({ ...tuning, reversed: { ...tuning.reversed, [key]: e.target.checked } })} /> Ters</label><div className="calibration"><button type="button" disabled={!padAxes.length} onClick={() => captureCalibration(key, 'min')}>Min</button><button type="button" disabled={!padAxes.length} onClick={() => captureCalibration(key, 'center')}>Orta</button><button type="button" disabled={!padAxes.length} onClick={() => captureCalibration(key, 'max')}>Maks</button></div></div>)}<label className="tuning">Ölü bölge {Math.round(tuning.deadzone * 100)}%<input type="range" min="0" max="0.2" step="0.01" value={tuning.deadzone} onChange={e => updateTuning({ ...tuning, deadzone: Number(e.target.value) })} /></label><label className="tuning">Expo {Math.round(tuning.expo * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={tuning.expo} onChange={e => updateTuning({ ...tuning, expo: Number(e.target.value) })} /></label><div className="axis-monitor"><strong>CANLI EKSENLER</strong>{padAxes.length ? padAxes.map((value, i) => <div key={i}>Eksen {i}<meter min={-1} max={1} value={value} />{value.toFixed(2)}</div>) : <p>Cihaz algılanınca eksen hareketleri burada görünür.</p>}</div><p className="muted">Her eksen için kolu en düşük, orta ve en yüksek konuma getirip ilgili düğmeye bas. Gaz ekseninde orta için kolu yarıya getir. Ayarlar bağlı cihaza özel saklanır. Kalibrasyondan sonra gaz yönünü ve sıfır gazı kontrol et.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)






