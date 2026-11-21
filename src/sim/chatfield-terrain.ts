import { chatfieldGrid, chatfieldGridSize, chatfieldSize } from './chatfield-data'
import { clamp, smoothstep } from './math'

const data = Uint8Array.from(atob(chatfieldGrid), char => char.charCodeAt(0))
const heights = new DataView(data.buffer)
const heightAt = (x: number, z: number) => heights.getInt16((z * chatfieldGridSize + x) * 2, true) / 10

export const chatfieldRunwayCenter: [number, number] = [-27, 27]
export const chatfieldRunwayHeading = 90

export function chatfieldHeight(x: number, z: number): number {
  const coordinate = (metres: number) => clamp((metres / chatfieldSize + .5) * chatfieldGridSize - .5, 0, chatfieldGridSize - 1)
  const u = coordinate(x), v = coordinate(z)
  const col = Math.min(Math.floor(u), chatfieldGridSize - 2), row = Math.min(Math.floor(v), chatfieldGridSize - 2)
  const tx = u - col, tz = v - row
  const north = heightAt(col, row) * (1 - tx) + heightAt(col + 1, row) * tx
  const south = heightAt(col, row + 1) * (1 - tx) + heightAt(col + 1, row + 1) * tx
  const [cx, cz] = chatfieldRunwayCenter
  // The graded apron includes adjacent mesh samples so they cannot cross the pavement.
  const grade = Math.max(smoothstep(123, 152, Math.abs(x - cx)), smoothstep(27, 43, Math.abs(z - cz)))
  return (north * (1 - tz) + south * tz) * grade
}
