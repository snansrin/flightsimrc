/** Chase-camera zoom should move the camera closer and narrow FOV, not away. */
export function chaseFraming(span: number, zoom: number): { distance: number; fov: number } {
  const safeZoom = Math.max(0.65, Math.min(2.2, Number.isFinite(zoom) ? zoom : 1))
  const safeSpan = Math.max(0, Number.isFinite(span) ? span : 0)
  return {
    distance: Math.max(1.35, safeSpan * 2.1) / safeZoom,
    fov: Math.max(40, Math.min(74, 58 / Math.sqrt(safeZoom))),
  }
}
