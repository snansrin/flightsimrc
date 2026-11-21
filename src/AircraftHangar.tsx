import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, MathUtils } from 'three'
import type { Controls } from './flight'
import { hangar, hangarAircraft } from './hangar'
import { VehicleModel } from './scene/Vehicles'

const initialView = { yaw: -.5, pitch: -.04, zoom: 1 }
const idle = { current: { throttle: 0, aileron: 0, elevator: 0, rudder: 0 } as Controls }

export default function AircraftHangar({ active, onClose, onSelect }: {
  active: string; onClose: () => void; onSelect: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const [selection, setSelection] = useState(active)
  const [view, setView] = useState(initialView)
  const spec = hangarAircraft(selection)
  const scale = 2.75 / Math.max(spec.span, spec.visual.fuselageLength, .2)
  useEffect(() => { dialog.current?.showModal() }, [])

  function rotate(yaw: number, pitch = 0) {
    setView(current => ({ ...current, yaw: (current.yaw + yaw) % (Math.PI * 2),
      pitch: MathUtils.clamp(current.pitch + pitch, -.62, .62) }))
  }

  return <dialog ref={dialog} className="aircraft-hangar" aria-labelledby="hangar-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="hangar-heading">
      <h2 id="hangar-title">Uçak hangarı</h2>
      <button type="button" onClick={onClose}>Kapat</button>
    </div>
    <div className="hangar-layout">
      <div className="hangar-list" role="group" aria-label="Uçak modelleri">
        {hangar.map(({ id, spec: item }) => <button key={id} type="button" aria-pressed={id === selection}
          onClick={() => { if (id !== selection) { setSelection(id); setView(initialView) } }}>
          <i aria-hidden="true" style={{ background: item.visual.accent }} />
          <span><strong>{item.name}</strong><small>{item.category}</small></span>
        </button>)}
      </div>
      <div className="hangar-preview">
        <div className="hangar-turntable" role="group" tabIndex={0} aria-label={spec.name + ' döndürülebilir 3B görünüm'}
          onPointerDown={event => {
            if (event.button !== 0 || drag.current) return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          }}
          onPointerMove={event => {
            const start = drag.current
            if (!start || event.pointerId !== start.id) return
            const dx = event.clientX - start.x, dy = event.clientY - start.y
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
            rotate(dx * .009, dy * .007)
          }}
          onLostPointerCapture={() => { drag.current = null }}
          onKeyDown={event => {
            const delta = { ArrowLeft: [-.2, 0], ArrowRight: [.2, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] }[event.key]
            if (!delta) return
            event.preventDefault()
            event.stopPropagation()
            rotate(delta[0], delta[1])
          }}
        >
          <Canvas frameloop="demand" dpr={[1, 1.5]} shadows camera={{ position: [0, 1.48, 3.8], fov: 38 }}
            gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping }}>
            <hemisphereLight args={['#eff6ff', '#81939d', 1.6]} />
            <directionalLight position={[1, 4, 3]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-3, 1, -3]} intensity={1.65} color="#b5d9ff" />
            <group rotation={[view.pitch, view.yaw, 0]} scale={scale * view.zoom}>
              <VehicleModel key={selection} kind={selection} controls={idle} />
            </group>
            <mesh position={[0, -.67, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[2.1, 64]} /><shadowMaterial opacity={.3} />
            </mesh>
          </Canvas>
        </div>
        <div className="hangar-view-controls">
          <small>Sürükleyerek döndür</small>
          <button type="button" onClick={() => rotate(-Math.PI / 6)} aria-label="Sola döndür">↶</button>
          <button type="button" onClick={() => rotate(Math.PI / 6)} aria-label="Sağa döndür">↷</button>
          <label>Yakınlık <input type="range" min=".7" max="1.45" step=".05" value={view.zoom}
            onChange={event => setView(current => ({ ...current, zoom: Number(event.target.value) }))} /></label>
          <button type="button" onClick={() => setView(initialView)}>Görüşü sıfırla</button>
        </div>
      </div>
      <div className="hangar-selection" aria-live="polite">
        <div><h3>{spec.name}</h3><p>{spec.summary}</p></div>
        <button type="button" className="hangar-confirm" onClick={() => onSelect(selection)}>
          {active === selection ? 'Uçuşa dön' : 'Bu modelle uç'}
        </button>
      </div>
    </div>
  </dialog>
}
