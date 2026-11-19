import { aircraftCatalog } from './sim/catalog'
import type { VehicleKind } from './vehicles'

const originalIds = new Map<string, VehicleKind>([
  ['trainer1500', 'trainer'], ['quad5', 'drone'], ['heli500', 'helicopter'], ['edf90', 'jet'],
])

export const hangar = aircraftCatalog.map(spec => ({
  id: originalIds.get(spec.id) ?? spec.id,
  spec,
}))

const hangarById = new Map(hangar.map(entry => [entry.id, entry.spec]))

export const hangarAircraft = (id: string) => hangarById.get(id) ?? hangar[0].spec
export const isHangarAircraft = (id: unknown): id is string => typeof id === 'string' && hangarById.has(id)

export function soundFamily(id: string): VehicleKind {
  const spec = hangarAircraft(id)
  if (spec.family === 'multirotor') return 'drone'
  if (spec.family === 'heli') return 'helicopter'
  return spec.prop.kind === 'edf' ? 'jet' : 'trainer'
}
