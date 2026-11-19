import type { RealtimeChannel } from '@supabase/supabase-js'
import { cloud } from './cloud'
import type { FlightState } from './flight'
import { isHangarAircraft } from './hangar'
import { fields } from './sim/fields'

export type RemotePilot = {
  id: string
  vehicle: string
  field: number
  position: [number, number, number]
  yaw: number
  pitch: number
  roll: number
  updatedAt: number
}
export type RoomPilot = { id: string; name: string; isHost: boolean }
export type RoomState = 'connecting' | 'connected' | 'disconnected' | 'error'
export const ROOM_LIMIT = 4
export const normalizeRoomCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
export const normalizePilotName = (value: string) => value.trim().replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 24)
export const createRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte % 32]).join('')
export async function roomTopic(code: string, password: string): Promise<string> {
  const normalized = normalizeRoomCode(code)
  if (!password) return `flightsimrc:${normalized}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(`flightsimrc-room-v1:${normalized}`), iterations: 120000, hash: 'SHA-256' }, key, 256))
  return `flightsimrc:${normalized}:${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}
const finite = (value: unknown, limit: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
const validField = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < fields.length

export function parsePilot(value: unknown): RemotePilot | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  if (typeof p.id !== 'string' || !/^[a-f0-9-]{36}$/.test(p.id) || !isHangarAircraft(p.vehicle)) return null
  if (!validField(p.field)) return null
  if (!Array.isArray(p.position) || p.position.length !== 3 || !p.position.every(v => finite(v, 10000))) return null
  if (![p.yaw, p.pitch, p.roll].every(v => finite(v, 1000))) return null
  return { id: p.id, vehicle: p.vehicle, field: p.field, position: p.position as [number, number, number], yaw: p.yaw as number, pitch: p.pitch as number, roll: p.roll as number, updatedAt: Date.now() }
}

export function connectRoom(options: {
  code: string
  topic: string
  id: string
  name: string
  isHost: boolean
  getFlight: () => { state: FlightState; vehicle: string; field: number }
  onStatus: (status: RoomState, message?: string) => void
  onPeers: (peers: RemotePilot[], count: number) => void
  onRoster: (pilots: RoomPilot[]) => void
  onField: (field: number) => void
}): () => void {
  if (!cloud) { options.onStatus('error', 'Bulut bağlantısı bulunamadı.'); return () => {} }
  const code = normalizeRoomCode(options.code)
  if (code.length < 6) { options.onStatus('error', 'Oda kodu en az 6 karakter olmalı.'); return () => {} }
  const peers = new Map<string, RemotePilot>()
  let channel: RealtimeChannel
  let ready = false
  let closed = false
  let count = 1
  let hasConnected = false
  let promoted = false
  let failed = false
  const joinedAt = Date.now()
  const emit = () => options.onPeers([...peers.values()], count)
  const syncPresence = () => {
    if (closed || failed) return
    const entries = Object.values(channel.presenceState()).flat() as Record<string, unknown>[]
    const members = entries.filter(e => typeof e.id === 'string' && typeof e.name === 'string' && normalizePilotName(e.name) === e.name && e.name.length >= 2 && typeof e.joinedAt === 'number').sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
    const hostSeen = members.some(entry => entry.isHost === true)
    const roster = members.map((entry, index) => ({ id: entry.id as string, name: entry.name as string, isHost: index === 0 }))
    options.onRoster(roster)
    const ids = new Set(roster.map(pilot => pilot.id))
    count = ids.size || 1
    for (const id of peers.keys()) if (!ids.has(id)) peers.delete(id)
    const host = members.find(e => e.isHost === true)
    if (host && host.id !== options.id && validField(host.field)) options.onField(host.field)
    emit()
    if (count > ROOM_LIMIT && !hasConnected && !options.isHost) {
      failed = true
      options.onStatus('error', 'Oda dolu (en fazla 4 pilot).')
      void cloud?.removeChannel(channel)
      ready = false
    }
    if (!options.isHost && !hasConnected && ready && count > 1 && hostSeen && count <= ROOM_LIMIT) { hasConnected = true; options.onStatus('connected') }
    if (!hostSeen && hasConnected && !options.isHost && !promoted && members[0]?.id === options.id) {
      promoted = true
      void channel.track({ id: options.id, name: normalizePilotName(options.name), isHost: true, field: options.getFlight().field, joinedAt })
    }
  }
  channel = cloud.channel(options.topic, { config: { broadcast: { self: false }, presence: { key: options.id } } })
    .on('broadcast', { event: 'flight' }, ({ payload }) => {
      const pilot = parsePilot(payload)
      if (!pilot || pilot.id === options.id || !channel.presenceState()[pilot.id]) return
      peers.set(pilot.id, pilot)
      emit()
    })
    .on('presence', { event: 'sync' }, syncPresence)
    .subscribe(async (status, error) => {
      if (closed) return
      if (status === 'SUBSCRIBED') {
        const field = options.getFlight().field
        const result = await channel.track({ id: options.id, name: normalizePilotName(options.name), isHost: options.isHost || promoted, field, joinedAt })
        if (closed) return
        failed = false
        if (result !== 'ok') { failed = true; options.onStatus('error', 'Odaya giriş doğrulanamadı.'); return }
        ready = true
        if (options.isHost) { hasConnected = true; options.onStatus('connected') }
        else syncPresence()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        ready = false
        failed = true
        options.onStatus('error', error?.message || 'Canlı bağlantı kesildi.')
      } else if (status === 'CLOSED' && !failed) {
        ready = false
        options.onStatus('disconnected')
      }
    })
  const joinTimeout = window.setTimeout(() => {
    if (closed || options.isHost || hasConnected) return
    ready = false
    failed = true
    options.onStatus('error', 'Oda bulunamadı veya şifre yanlış. Kodu ve şifreyi kontrol et.')
    options.onRoster([])
    options.onPeers([], 1)
    void cloud?.removeChannel(channel)
  }, 6000)
  const timer = window.setInterval(() => {
    if (!ready || !hasConnected || document.hidden) return
    const { state, vehicle, field } = options.getFlight()
    const packet = { id: options.id, vehicle, field, position: state.position, yaw: state.yaw, pitch: state.pitch, roll: state.roll }
    void channel.send({ type: 'broadcast', event: 'flight', payload: packet })
    for (const [id, peer] of peers) if (Date.now() - peer.updatedAt > 5000) peers.delete(id)
    emit()
  }, 200)
  return () => {
    closed = true
    ready = false
    window.clearInterval(timer)
    window.clearTimeout(joinTimeout)
    void cloud?.removeChannel(channel)
    options.onPeers([], 1)
    options.onRoster([])
  }
}
