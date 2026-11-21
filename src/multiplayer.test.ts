import { describe, expect, it } from 'vitest'
import { normalizePilotName, normalizeRoomCode, parsePilot, roomTopic } from './multiplayer'
import { fields } from './sim/fields'

const pilot = { id: '123e4567-e89b-42d3-a456-426614174000', vehicle: 'trainer', field: 0, position: [1, 2, 3], yaw: .2, pitch: .1, roll: 0 }

describe('multiplayer packet boundary', () => {
  it('normalizes invite codes', () => {
    expect(normalizeRoomCode('ab-c 1234!!')).toBe('ABC1234')
  })
  it('accepts a finite aircraft pose', () => {
    expect(parsePilot(pilot)).toMatchObject(pilot)
    expect(parsePilot({ ...pilot, field: fields.length - 1 })).toMatchObject({ field: fields.length - 1 })
  })
  it('rejects malformed and extreme packets', () => {
    expect(parsePilot({ ...pilot, position: [0, Infinity, 0] })).toBeNull()
    expect(parsePilot({ ...pilot, position: [0, 20000, 0] })).toBeNull()
    expect(parsePilot({ ...pilot, vehicle: 'unknown' })).toBeNull()
    expect(parsePilot({ ...pilot, field: fields.length })).toBeNull()
  })
  it('keeps pilot names short and safe for the roster', () => {
    expect(normalizePilotName('  Ada   Pilot<script> ')).toBe('Ada Pilotscript')
    expect(normalizePilotName('A'.repeat(40))).toHaveLength(24)
  })
  it('derives distinct channel topics for different room passwords', async () => {
    const first = await roomTopic('abcd2345', 'very-long-password')
    expect(first).toBe(await roomTopic('ABCD2345', 'very-long-password'))
    expect(first).not.toBe(await roomTopic('ABCD2345', 'another-password'))
    expect(first).not.toContain('very-long-password')
    expect(await roomTopic('ABCD2345', '')).toBe('flightsimrc:ABCD2345')
  })
})
