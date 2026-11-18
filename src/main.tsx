import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { initialFlight, stepFlight, type Controls, type FlightState } from './flight'
import { defaultMapping, gamepadControls, type Mapping, type AxisKey } from './input'
import './style.css'

const airfields = [
  { name: 'Anadolu Eğitim Pisti', terrain: '#647b5b', sky: '#b8d5df', wind: 0 },
  { name: 'Ege Kıyı Pisti', terrain: '#a7a179', sky: '#a8cfdf', wind: 1.5 },
  { name: 'Alp Vadisi', terrain: '#69735c', sky: '#a9c5d5', wind: -2 },
  { name: 'Çöl Meydanı', terrain: '#c4a77a', sky: '#c6dce5', wind: 2.5 },
  { name: 'Kuzey Yaylası', terrain: '#7c897f', sky: '#c8d4da', wind: -1.2 },
]
const zero: Controls = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }
function Aircraft({ state }: { state: React.MutableRefObject<FlightState> }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const s = state.current
    if (!ref.current) return
    ref.current.position.set(...s.position)
    ref.current.rotation.set(-s.pitch, s.yaw, -s.roll, 'YXZ')
    const desired = new THREE.Vector3(s.position[0] - Math.sin(s.yaw) * 15, s.position[1] + 6, s.position[2] - Math.cos(s.yaw) * 15)
    camera.position.lerp(desired, 0.055)
    camera.lookAt(s.position[0], s.position[1] + 1, s.position[2] + 5)
  })
  return <group ref={ref}>
    <mesh><boxGeometry args={[0.8, 0.55, 4]} /><meshStandardMaterial color="#f2eee1" /></mesh>
    <mesh position={[0, 0.12, 0.1]}><boxGeometry args={[8, 0.12, 1.15]} /><meshStandardMaterial color="#ea743c" /></mesh>
    <mesh position={[0, 0.45, -1.6]}><boxGeometry args={[3, 0.1, 0.5]} /><meshStandardMaterial color="#e9e8db" /></mesh>
    <mesh position={[0, 0.8, -1.8]}><boxGeometry args={[0.12, 0.9, 0.55]} /><meshStandardMaterial color="#ea743c" /></mesh>
    <mesh position={[0, -0.45, 0.45]}><boxGeometry args={[0.1, 1.6, 0.1]} /><meshStandardMaterial color="#222c30" /></mesh>
  </group>
}
function Scene({ state, field }: { state: React.MutableRefObject<FlightState>; field: typeof airfields[number] }) {
  return <Canvas camera={{ position: [0, 6, -15], fov: 65 }} shadows><color attach="background" args={[field.sky]} /><fog attach="fog" args={[field.sky, 100, 550]} /><hemisphereLight intensity={2} /><directionalLight position={[20, 50, 15]} intensity={2.2} castShadow />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow><planeGeometry args={[3000, 3000]} /><meshStandardMaterial color={field.terrain} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 55]}><planeGeometry args={[12, 230]} /><meshStandardMaterial color="#383e42" /></mesh>
    {Array.from({ length: 10 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -42 + i * 20]}><planeGeometry args={[0.3, 8]} /><meshBasicMaterial color="#f2eadb" /></mesh>)}
    <Aircraft state={state} /></Canvas>
}
function App() {
  const flight = useRef(initialFlight())
  const controls = useRef<Controls>({ ...zero })
  const keys = useRef(new Set<string>())
  const [hud, setHud] = useState(initialFlight())
  const [fieldIndex, setFieldIndex] = useState(0)
  const [mapping, setMapping] = useState<Mapping>(() => { try { return { ...defaultMapping, ...JSON.parse(localStorage.getItem('flight-mapping') || '{}') } } catch { return defaultMapping } })
  const [padName, setPadName] = useState('Klavye')
  const [paused, setPaused] = useState(false)
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
      if (pad) controls.current = gamepadControls(pad, mapping)
      else {
        const k = keys.current
        controls.current = { throttle: Math.max(0, Math.min(1, controls.current.throttle + ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * delta * 0.35)), aileron: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0), elevator: (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0), rudder: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0) }
      }
      if (!paused) { accumulator += delta; while (accumulator >= 1 / 60) { flight.current = stepFlight(flight.current, controls.current, 1 / 60, airfields[fieldIndex].wind); accumulator -= 1 / 60 } }
      if (now - display > 100) { setHud({ ...flight.current }); display = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [fieldIndex, mapping, paused])
  const reset = () => { flight.current = initialFlight(); controls.current = { ...zero }; setHud(flight.current) }
  const updateMapping = (key: AxisKey, axis: number) => { const next = { ...mapping, [key]: axis }; setMapping(next); localStorage.setItem('flight-mapping', JSON.stringify(next)) }
  const speed = Math.hypot(hud.velocity[0], hud.velocity[2])
  return <main><header><div className="brand"><span className="mark">✦</span><div><strong>FlightSim<span>RC</span></strong><small>UÇUŞ AKADEMİSİ</small></div></div><nav><span className="live">● SOLO EĞİTİM</span><button onClick={() => setShowSettings(!showSettings)}>⚙ Kumanda ayarları</button></nav></header>
    <section className="intro"><div><p className="eyebrow">RC PİLOTLUĞA İLK ADIM</p><h1>Uçuşu hisset.<br/><em>Kontrolü öğren.</em></h1><p>Trainer uçağıyla kalkış, dönüş ve iniş çalış. Gerçek kumandanı bağla veya klavyeyle hemen başla.</p></div><div className="lesson"><span>01 / TEMEL EĞİTİM</span><strong>Kalkış ve düz uçuş</strong><p>Gazı artır, pist boyunca hızlan ve irtifa kazan. Sert inişte uçağı sıfırla.</p></div></section>
    <section className="sim"><div className="simtop"><div><span className="red-dot">●</span> CANLI SİMÜLATÖR <span className="sep">/</span> TRAINER 01</div><div>{padName.slice(0, 42)} bağlı</div></div><div className="viewport"><Scene state={flight} field={airfields[fieldIndex]} />{hud.crashed && <div className="crash"><strong>Sert iniş</strong><span>Yeni uçuş için sıfırla</span><button onClick={reset}>Yeniden başla</button></div>}<div className="crosshair">+</div><div className="hud"><div><small>HIZ</small><strong>{Math.round(speed * 3.6)}</strong><span>km/sa</span></div><div><small>İRTİFA</small><strong>{Math.round(Math.max(0, hud.position[1] - 1.1))}</strong><span>m</span></div><div><small>GAZ</small><strong>{Math.round(controls.current.throttle * 100)}</strong><span>%</span></div><div><small>BAŞ</small><strong>{Math.round((hud.yaw * 180 / Math.PI + 3600) % 360)}</strong><span>°</span></div></div></div><div className="toolbar"><label>UÇUŞ ALANI <select value={fieldIndex} onChange={e => { setFieldIndex(Number(e.target.value)); reset() }}>{airfields.map((f, i) => <option value={i} key={f.name}>{f.name}</option>)}</select></label><div><button onClick={() => setPaused(!paused)}>{paused ? '▶ Devam' : 'Ⅱ Duraklat'}</button><button onClick={reset}>↺ Uçağı sıfırla</button></div></div></section>
    <section className="info"><div><span>01</span><strong>KLAVYE</strong><p>W / S gaz · Oklar veya A / D yön · Q / E dümen</p></div><div><span>02</span><strong>RC KUMANDA / JOYSTICK</strong><p>USB cihazını bağla. Gamepad API üzerinden otomatik algılanır; kanal eşlemesini ayarlardan değiştir.</p></div><div><span>03</span><strong>UÇUŞ MODELİ</strong><p>60 Hz adımlı temel 6DoF yaklaşımı. Eğitim prototipi; gerçek uçuş öncesi fiziksel eğitim yerine geçmez.</p></div></section>
    {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><aside onClick={e => e.stopPropagation()}><button className="close" onClick={() => setShowSettings(false)}>✕</button><p className="eyebrow">GİRİŞ AYARLARI</p><h2>Kumanda kanalları</h2><p>Bağlı cihaz: {padName}. Eksen numaraları cihazına göre değişebilir.</p>{(Object.keys(mapping) as AxisKey[]).map(key => <label className="axis" key={key}>{key}<select value={mapping[key]} onChange={e => updateMapping(key, Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => <option value={i} key={i}>Eksen {i}</option>)}</select></label>)}<p className="muted">Eşleme bu tarayıcıda saklanır. Gaz ekseni −1 = tam gaz kabul edilir.</p></aside></div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
