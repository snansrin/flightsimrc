import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { initialFlight, stepFlight, type Controls, type FlightState } from './flight'
import { defaultMapping, defaultTuning, gamepadControls, type Mapping, type AxisKey, type InputTuning } from './input'
import { Trainer } from './scene/Trainer'
import { Airfield, airfields } from './scene/Airfield'
import './style.css'

const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
function Aircraft({ state, controls, cameraMode }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; cameraMode: 'chase' | 'pilot' }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const s = state.current
    if (!ref.current) return
    ref.current.position.set(...s.position)
    ref.current.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const desired = cameraMode === 'pilot'
      ? new THREE.Vector3(12, 1.8, -55)
      : new THREE.Vector3(s.position[0] - Math.sin(s.yaw) * 3.7, s.position[1] + 1.25, s.position[2] - Math.cos(s.yaw) * 3.7)
    camera.position.lerp(desired, cameraMode === 'pilot' ? .1 : .07)
    camera.lookAt(s.position[0], s.position[1] + (cameraMode === 'pilot' ? 0 : .15), s.position[2] + (cameraMode === 'pilot' ? 0 : 2))
  })
  return <group ref={ref}><Trainer controls={controls} /></group>
}
function Scene({ state, controls, field, cameraMode }: { state: React.MutableRefObject<FlightState>; controls: React.MutableRefObject<Controls>; field: typeof airfields[number]; cameraMode: 'chase' | 'pilot' }) {
  return <Canvas camera={{ position: [0, 1.4, -4], fov: 58, near: .025, far: 800 }} dpr={[1, 1.6]} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
    <Airfield field={field} /><Aircraft state={state} controls={controls} cameraMode={cameraMode} />
  </Canvas>
}
function App() {
  const simRef = useRef<HTMLElement>(null)
  const flight = useRef(initialFlight())
  const controls = useRef<Controls>({ ...zero })
  const keys = useRef(new Set<string>())
  const [hud, setHud] = useState(initialFlight())
  const [fieldIndex, setFieldIndex] = useState(0)
  const [mapping, setMapping] = useState<Mapping>(() => { try { return { ...defaultMapping, ...JSON.parse(localStorage.getItem('flight-mapping') || '{}') } } catch { return defaultMapping } })
  const [tuning, setTuning] = useState<InputTuning>(() => { try { const saved = JSON.parse(localStorage.getItem('flight-tuning') || '{}'); return { ...defaultTuning, ...saved, reversed: { ...defaultTuning.reversed, ...saved.reversed } } } catch { return defaultTuning } })
  const [padAxes, setPadAxes] = useState<number[]>([])
  const [padName, setPadName] = useState('Klavye')
  const [paused, setPaused] = useState(false)
  const [cameraMode, setCameraMode] = useState<'chase' | 'pilot'>('chase')
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); keys.current.add(e.code) }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  useEffect(() => {
    let frame = 0, last = performance.now(), accumulator = 0, display = 0
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1); last = now
      const pad = navigator.getGamepads?.().find(Boolean)
      setPadName(previous => { const next = pad?.id || 'Klavye'; return previous === next ? previous : next })
      if (pad) controls.current = gamepadControls(pad, mapping, tuning)
      else {
        const k = keys.current
        controls.current = { throttle: Math.max(0, Math.min(1, controls.current.throttle + ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * delta * 0.35)), aileron: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), elevator: (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0), rudder: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) }
      }
      if (!paused) { accumulator += delta; while (accumulator >= 1 / 60) { flight.current = stepFlight(flight.current, controls.current, 1 / 60, airfields[fieldIndex].wind); accumulator -= 1 / 60 } }
      if (now - display > 100) { setHud({ ...flight.current }); setPadAxes(pad ? [...pad.axes] : []); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [fieldIndex, mapping, tuning, paused])
  const reset = () => { flight.current = initialFlight(); controls.current = { ...zero }; setHud(flight.current) }
  const updateMapping = (key: AxisKey, axis: number) => { const next = { ...mapping, [key]: axis }; setMapping(next); localStorage.setItem('flight-mapping', JSON.stringify(next)) }
  const updateTuning = (next: InputTuning) => { setTuning(next); localStorage.setItem('flight-tuning', JSON.stringify(next)) }
  const speed = hud.airspeed
  const bank = Math.round(hud.roll * 180 / Math.PI)
  const pitch = Math.round(hud.pitch * 180 / Math.PI)
  return <main><header><div className="brand"><span className="mark">✦</span><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● SOLO EĞİTİM</span><button onClick={() => setShowSettings(!showSettings)}>⚙ Kumanda ayarları</button></nav></header>
    <section className="intro"><div><p className="eyebrow">RC PİLOTLUĞA İLK ADIM</p><h1>Uçuşu hisset.<br/><em>Kontrolü öğren.</em></h1><p>Trainer uçağıyla kalkış, dönüş ve iniş çalış. Gerçek kumandanı bağla veya klavyeyle hemen başla.</p></div><div className="lesson"><span>01 / TEMEL EĞİTİM</span><strong>Kalkış ve düz uçuş</strong><p>Gazı artır, pist boyunca hızlan ve irtifa kazan. Sert inişte uçağı sıfırla.</p></div></section>
    <section className="sim" ref={simRef}><div className="simtop"><div><span className="red-dot">●</span> CANLI SİMÜLATÖR <span className="sep">/</span> TRAINER 01</div><div>{padName.slice(0, 42)} bağlı</div></div><div className="viewport"><Scene state={flight} controls={controls} field={airfields[fieldIndex]} cameraMode={cameraMode} />{hud.crashed && <div className="crash"><strong>Sert iniş</strong><span>Yeni uçuş için sıfırla</span><button onClick={reset}>Yeniden başla</button></div>}<div className="crosshair">+</div><div className="scene-label"><strong>{airfields[fieldIndex].name}</strong><span>{airfields[fieldIndex].subtitle} · {Math.abs(airfields[fieldIndex].wind).toFixed(1)} m/s yan rüzgâr</span></div>{hud.stalled && !hud.crashed && <div className="flight-warning">STALL · BURNU İNDİR, HIZ KAZAN</div>}<div className="attitude"><span>YATIŞ {bank}°</span><span>BURUN {pitch}°</span><span>ALFA {Math.round(hud.angleOfAttack * 180 / Math.PI)}°</span></div><div className="hud"><div><small>HAVA HIZI</small><strong>{Math.round(speed * 3.6)}</strong><span>km/sa</span></div><div><small>İRTİFA</small><strong>{Math.round(Math.max(0, hud.position[1] - .25))}</strong><span>m</span></div><div><small>GAZ</small><strong>{Math.round(controls.current.throttle * 100)}</strong><span>%</span></div><div><small>BAŞ</small><strong>{Math.round((hud.yaw * 180 / Math.PI + 3600) % 360)}</strong><span>°</span></div></div></div><div className="toolbar"><label>UÇUŞ ALANI <select value={fieldIndex} onChange={e => { setFieldIndex(Number(e.target.value)); reset() }}>{airfields.map((f, i) => <option value={i} key={f.name}>{f.name}</option>)}</select></label><div><button onClick={() => setCameraMode(cameraMode === 'chase' ? 'pilot' : 'chase')}>{cameraMode === 'chase' ? '◉ Pilot görüşü' : '◉ Takip görüşü'}</button><button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void simRef.current?.requestFullscreen() }}>⛶ Tam ekran</button><button onClick={() => setPaused(!paused)}>{paused ? '▶ Devam' : 'Ⅱ Duraklat'}</button><button onClick={reset}>↺ Uçağı sıfırla</button></div></div></section>
    <section className="info"><div><span>01</span><strong>KLAVYE</strong><p>W / S gaz · Oklar pitch ve roll · A / D roll · Q / E dümen. Kalkış için hızlandıktan sonra yukarı ok.</p></div><div><span>02</span><strong>RC KUMANDA / JOYSTICK</strong><p>USB cihazını bağla. Gamepad API üzerinden otomatik algılanır; kanal eşlemesini ayarlardan değiştir.</p></div><div><span>03</span><strong>TRAINER UÇUŞ MODELİ</strong><p>Hava hızına bağlı kaldırma, sürükleme, yan rüzgâr ve stall davranışı. Pilot görüşüyle gerçek RC perspektifini dene; model hâlâ test verileriyle kalibre edilmeli.</p></div></section>
    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">GİRİŞ AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Bir düğmeye basarak cihazı tarayıcıda etkinleştir.</p>{(Object.keys(mapping) as AxisKey[]).map(key => <div className="axis" key={key}><label htmlFor={`axis-${key}`}>{key}</label><select id={`axis-${key}`} value={mapping[key]} onChange={e => updateMapping(key, Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => <option value={i} key={i}>Eksen {i}</option>)}</select><label className="reverse"><input type="checkbox" checked={tuning.reversed[key]} onChange={e => updateTuning({ ...tuning, reversed: { ...tuning.reversed, [key]: e.target.checked } })} /> Ters</label></div>)}<label className="tuning">Ölü bölge {Math.round(tuning.deadzone * 100)}%<input type="range" min="0" max="0.2" step="0.01" value={tuning.deadzone} onChange={e => updateTuning({ ...tuning, deadzone: Number(e.target.value) })} /></label><label className="tuning">Expo {Math.round(tuning.expo * 100)}%<input type="range" min="0" max="0.8" step="0.05" value={tuning.expo} onChange={e => updateTuning({ ...tuning, expo: Number(e.target.value) })} /></label><div className="axis-monitor"><strong>CANLI EKSENLER</strong>{padAxes.length ? padAxes.map((value, i) => <div key={i}>Eksen {i}<meter min={-1} max={1} value={value} />{value.toFixed(2)}</div>) : <p>Cihaz algılanınca eksen hareketleri burada görünür.</p>}</div><p className="muted">Ayarlar bu tarayıcıda saklanır. Gaz yönünü cihazına göre tersleyip sıfır gazı kontrol et.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
