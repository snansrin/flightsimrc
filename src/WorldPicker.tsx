import { useEffect, useRef, useState } from 'react'
import { Map, Marker, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mercatorLatitude, satelliteCredit, satelliteTemplate, type WorldPoint } from './sim/worldTerrain'

setWorkerUrl(workerUrl)

const sites = [
  { label: 'Ankara', latitude: 39.9552, longitude: 32.8117 },
  { label: 'İstanbul', latitude: 41.0231, longitude: 29.0122 },
  { label: 'Alpler', latitude: 46.6786, longitude: 7.8854 },
  { label: 'Colorado', latitude: 39.5323, longitude: -105.0604 },
]
const style: StyleSpecification = {
  version: 8, projection: { type: 'globe' },
  sources: { satellite: { type: 'raster', tiles: [satelliteTemplate], tileSize: 256, maxzoom: 14 } },
  layers: [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#142b40' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
  ],
  sky: { 'sky-color': '#546e87', 'horizon-color': '#a5b9cd', 'fog-color': '#a5b9cd' },
}

export default function WorldPicker({ initial, onClose, onLaunch }: {
  initial?: WorldPoint; onClose: () => void; onLaunch: (point: WorldPoint) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => ({ latitude: String(initial?.latitude ?? sites[0].latitude), longitude: String(initial?.longitude ?? sites[0].longitude) }))
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [launchError, setLaunchError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const marker = useRef<Marker | null>(null)
  const clicked = (point: WorldPoint) => setDraft({ latitude: point.latitude.toFixed(5), longitude: point.longitude.toFixed(5) })
  const point = { latitude: Number(draft.latitude), longitude: Number(draft.longitude) }
  const valid = Boolean(draft.latitude.trim() && draft.longitude.trim()) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) < mercatorLatitude - .05 && Math.abs(point.longitude) <= 180

  useEffect(() => { dialog.current?.showModal() }, [])

  useEffect(() => {
    if (!surface.current) return
    try {
      const instance = new Map({ container: surface.current, style, center: [initial?.longitude ?? sites[0].longitude, initial?.latitude ?? sites[0].latitude],
        zoom: initial ? 8 : 2, pixelRatio: 1, dragRotate: false, pitchWithRotate: false, attributionControl: false })
      map.current = instance
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      marker.current = new Marker({ color: '#ffbd65' }).setLngLat(instance.getCenter()).addTo(instance)
      instance.on('click', ({ lngLat }) => clicked({ latitude: lngLat.lat, longitude: lngLat.wrap().lng }))
      instance.on('error', () => setNotice('Bazı uydu karoları yüklenemedi. Koordinatla konum seçebilirsin.'))
      return () => { marker.current?.remove(); marker.current = null; instance.remove(); map.current = null }
    } catch { setNotice('Harita açılamadı. Koordinat girerek konum seçebilirsin.') }
  }, [initial])

  useEffect(() => {
    if (valid) marker.current?.setLngLat([point.longitude, point.latitude])
  }, [point.latitude, point.longitude, valid])

  async function launch() {
    if (!valid || loading) return
    setLaunchError('')
    setLoading(true)
    try { await onLaunch(point) }
    catch {
      setLaunchError('Bu konumun yükseklik verisi alınamadı. Tekrar dene veya başka bir nokta seç.')
      setLoading(false)
    }
  }

  return <dialog ref={dialog} className="earth-picker" aria-labelledby="earth-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="earth-toolbar">
      <div><h2 id="earth-title">Dünya Keşfi</h2><p>Haritadan bir nokta seç veya koordinat gir.</p></div>
      <button type="button" onClick={onClose} aria-label="Dünya haritasını kapat">Kapat</button>
    </div>
    <div ref={surface} className="earth-globe" aria-label="Dünya uydu haritası" />
    <div className="earth-form">
      <div className="earth-presets" aria-label="Başlangıç konumları">
        {sites.map(site => <button type="button" key={site.label} disabled={loading} onClick={() => {
          clicked(site)
          map.current?.easeTo({ center: [site.longitude, site.latitude], zoom: 9, duration: 600 })
        }}>{site.label}</button>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); void launch() }}>
        <label>Enlem<input type="number" name="latitude" step="any" value={draft.latitude} onChange={event => setDraft({ ...draft, latitude: event.target.value })} disabled={loading} /></label>
        <label>Boylam<input type="number" name="longitude" step="any" value={draft.longitude} onChange={event => setDraft({ ...draft, longitude: event.target.value })} disabled={loading} /></label>
        <button type="submit" disabled={!valid || loading}>{loading ? 'Arazi yükleniyor…' : 'Burada uç'}</button>
      </form>
      {(launchError || notice) && <small role="status">{launchError || notice}</small>}
      <a href="https://cloudless.eox.at/" target="_blank" rel="noreferrer">{satelliteCredit}</a>
    </div>
  </dialog>
}
