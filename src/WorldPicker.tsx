import { useEffect, useRef, useState } from 'react'
import { Map, Marker, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mercatorLatitude, satelliteCredit, satelliteTemplate, worldAltitude, type WorldPoint, type WorldStart } from './sim/worldTerrain'

setWorkerUrl(workerUrl)

const sites = [
  { label: 'Ankara', latitude: 39.9552, longitude: 32.8117, heading: 110, altitude: 150 },
  { label: 'İstanbul', latitude: 41.0231, longitude: 29.0122, heading: 45, altitude: 180 },
  { label: 'Alpler', latitude: 46.6786, longitude: 7.8854, heading: 65, altitude: 240 },
  { label: 'Colorado', latitude: 39.5323, longitude: -105.0604, heading: 270, altitude: 150 },
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
  initial?: WorldStart; onClose: () => void; onLaunch: (point: WorldStart) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => ({ latitude: String(initial?.latitude ?? sites[0].latitude), longitude: String(initial?.longitude ?? sites[0].longitude) }))
  const [heading, setHeading] = useState(() => String(initial?.heading ?? sites[0].heading))
  const [altitude, setAltitude] = useState(() => String(initial?.altitude ?? worldAltitude.default))
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [launchError, setLaunchError] = useState('')
  const [streetMap, setStreetMap] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const marker = useRef<Marker | null>(null)
  const clicked = (point: WorldPoint) => setDraft({ latitude: point.latitude.toFixed(5), longitude: point.longitude.toFixed(5) })
  const point = { latitude: Number(draft.latitude), longitude: Number(draft.longitude) }
  const validPoint = Boolean(draft.latitude.trim() && draft.longitude.trim()) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) < mercatorLatitude - .05 && Math.abs(point.longitude) <= 180
  const bearing = Number(heading), height = Number(altitude)
  const validHeading = Boolean(heading.trim()) && Number.isInteger(bearing) && bearing >= 0 && bearing <= 359
  const valid = validPoint && validHeading && Number.isInteger(height) && height >= worldAltitude.min && height <= worldAltitude.max

  useEffect(() => { dialog.current?.showModal() }, [])

  useEffect(() => {
    if (!surface.current) return
    try {
      const instance = new Map({ container: surface.current, style, center: [initial?.longitude ?? sites[0].longitude, initial?.latitude ?? sites[0].latitude],
        zoom: initial ? 8 : 2, pixelRatio: 1, dragRotate: false, pitchWithRotate: false, attributionControl: false })
      map.current = instance
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      const arrow = document.createElement('div')
      arrow.className = 'earth-heading-marker'
      arrow.setAttribute('aria-hidden', 'true')
      marker.current = new Marker({ element: arrow, rotationAlignment: 'map' }).setLngLat(instance.getCenter()).addTo(instance)
      instance.on('click', ({ lngLat }) => clicked({ latitude: lngLat.lat, longitude: lngLat.wrap().lng }))
      instance.on('error', () => setNotice('Bazı harita karoları yüklenemedi. Koordinatla konum seçebilirsin.'))
      return () => { marker.current?.remove(); marker.current = null; instance.remove(); map.current = null }
    } catch { setNotice('Harita açılamadı. Koordinat girerek konum seçebilirsin.') }
  }, [initial])

  useEffect(() => {
    if (validPoint) marker.current?.setLngLat([point.longitude, point.latitude])
    if (validHeading) marker.current?.setRotation(bearing)
  }, [point.latitude, point.longitude, validPoint, validHeading, bearing])

  async function launch() {
    if (!valid || loading) return
    setLaunchError('')
    setLoading(true)
    try { await onLaunch({ ...point, heading: bearing, altitude: height }) }
    catch {
      setLaunchError('Bu konumun yükseklik verisi alınamadı. Tekrar dene veya başka bir nokta seç.')
      setLoading(false)
    }
  }

  function chooseMap(streets: boolean) {
    if (streets === streetMap || !map.current) return
    setStreetMap(streets)
    setNotice('')
    map.current.setStyle(streets ? 'https://tiles.openfreemap.org/styles/liberty' : style, {
      transformStyle: (_, next) => ({ ...next, projection: { type: 'globe' } }),
    })
  }

  return <dialog ref={dialog} className="earth-picker" aria-labelledby="earth-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="earth-toolbar">
      <div><h2 id="earth-title">Dünya Keşfi</h2><p>Haritadan bir nokta seç veya koordinat gir.</p></div>
      <button type="button" onClick={onClose} aria-label="Dünya haritasını kapat">Kapat</button>
    </div>
    <div className="earth-map-wrap">
      <div ref={surface} className="earth-globe" aria-label={streetMap ? 'Dünya yol haritası' : 'Dünya uydu haritası'} />
      <div className="earth-map-layers" role="group" aria-label="Harita görüntüsü">
        <button type="button" aria-pressed={!streetMap} onClick={() => chooseMap(false)}>Uydu</button>
        <button type="button" aria-pressed={streetMap} onClick={() => chooseMap(true)}>Yollar ve yer adları</button>
      </div>
    </div>
    <div className="earth-form">
      <div className="earth-presets" aria-label="Başlangıç konumları">
        {sites.map(site => <button type="button" key={site.label} disabled={loading} onClick={() => {
          clicked(site)
          setHeading(String(site.heading))
          setAltitude(String(site.altitude))
          map.current?.easeTo({ center: [site.longitude, site.latitude], zoom: 9, duration: 600 })
        }}>{site.label}</button>)}
      </div>
      <form onSubmit={event => { event.preventDefault(); void launch() }}>
        <label>Enlem<input type="number" name="latitude" step="any" value={draft.latitude} onChange={event => setDraft({ ...draft, latitude: event.target.value })} disabled={loading} /></label>
        <label>Boylam<input type="number" name="longitude" step="any" value={draft.longitude} onChange={event => setDraft({ ...draft, longitude: event.target.value })} disabled={loading} /></label>
        <label>Başlangıç yönü (°)<input type="number" min="0" max="359" step="1" value={heading} onChange={event => setHeading(event.target.value)} disabled={loading} /></label>
        <label>Yerden irtifa (m)<input type="number" min={worldAltitude.min} max={worldAltitude.max} step="1" value={altitude} onChange={event => setAltitude(event.target.value)} disabled={loading} /></label>
        <button type="submit" disabled={!valid || loading}>{loading ? 'Arazi yükleniyor…' : 'Burada uç'}</button>
      </form>
      {(launchError || notice) && <small role="status">{launchError || notice}</small>}
      {streetMap ? <span className="map-credit"><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></span>
        : <a href="https://cloudless.eox.at/" target="_blank" rel="noreferrer">{satelliteCredit}</a>}
    </div>
  </dialog>
}
