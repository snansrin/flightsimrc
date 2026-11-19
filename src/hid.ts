import type { AxisKey, InputSource } from './input'

// Descriptor-driven WebHID input for controllers not fully exposed by Gamepad API.
// No vendor IDs or report byte offsets are hard-coded.
export type HidItem = {
  reportSize: number; reportCount: number; logicalMinimum: number; logicalMaximum: number
  usagePage?: number; usages?: number[]; usageMinimum?: number; usageMaximum?: number
  isConstant?: boolean; isArray?: boolean; isAbsolute?: boolean
}
export type HidReport = { reportId: number; items: HidItem[] }
export type HidCollection = { usagePage: number; usage: number; inputReports: HidReport[]; children: HidCollection[] }
export type HidDeviceLike = {
  productName: string; vendorId: number; productId: number; opened: boolean; collections: HidCollection[]
  open(): Promise<void>; close(): Promise<void>
  addEventListener(type: 'inputreport', listener: (event: HidInputEvent) => void): void
  removeEventListener(type: 'inputreport', listener: (event: HidInputEvent) => void): void
}
export type HidInputEvent = { reportId: number; data: DataView }
type HidConnection = { device: HidDeviceLike }
type HidApi = {
  getDevices(): Promise<HidDeviceLike[]>
  requestDevice(options: { filters: object[] }): Promise<HidDeviceLike[]>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: HidConnection) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: HidConnection) => void): void
}
type Field = { offset: number; size: number; min: number; max: number; index: number; kind: 'axis' | 'button' }
export type HidLayout = {
  reports: Map<number, Field[]>; axisCount: number; buttonCount: number
  flightAxes: Partial<Record<AxisKey, InputSource>>
}
const flightUsage: Partial<Record<number, AxisKey>> = { 0xb0: 'aileron', 0xb8: 'elevator', 0xba: 'rudder', 0xbb: 'throttle' }
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

export function hidApi(): HidApi | null {
  return (navigator as Navigator & { hid?: HidApi }).hid ?? null
}

export function buildHidLayout(collections: HidCollection[]): HidLayout {
  const reports = new Map<number, Field[]>()
  const flightAxes: HidLayout['flightAxes'] = {}
  const offsets = new Map<number, number>()
  let axisCount = 0, buttonCount = 0
  const walk = (collection: HidCollection) => {
    for (const report of collection.inputReports || []) {
      const fields = reports.get(report.reportId) || []
      let offset = offsets.get(report.reportId) || 0
      for (const item of report.items || []) {
        const size = item.reportSize, count = item.reportCount
        if (!Number.isInteger(size) || size < 1 || !Number.isInteger(count) || count < 1) continue
        if (size > 32 || count > 256) { offset += size * count; continue }
        for (let index = 0; index < count; index++) {
          const usage = item.usages?.[index] ?? (item.usageMinimum === undefined ? undefined : item.usageMinimum + index)
          const page = (usage === undefined ? 0 : usage >>> 16) || item.usagePage || collection.usagePage
          const code = usage === undefined ? undefined : usage & 0xffff
          const isButton = page === 0x09 && usage !== undefined
          const isAxis = (page === 0x01 && code !== undefined && code >= 0x30 && code <= 0x38)
            || (page === 0x02 && code !== undefined && code >= 0xb0 && code <= 0xd0 && size >= 8)
            || (page >= 0xff00 && size >= 8)
          if (!item.isConstant && !item.isArray && item.isAbsolute !== false
            && (item.usageMaximum === undefined || usage === undefined || usage <= item.usageMaximum)
            && item.logicalMaximum > item.logicalMinimum && (isAxis || isButton)) {
            const flightAxis = page === 0x02 && code !== undefined ? flightUsage[code] : undefined
            if (flightAxis && flightAxes[flightAxis] === undefined) flightAxes[flightAxis] = `axis:${axisCount}`
            fields.push({ offset, size, min: item.logicalMinimum, max: item.logicalMaximum, kind: isAxis ? 'axis' : 'button', index: isAxis ? axisCount++ : buttonCount++ })
          }
          offset += size
        }
      }
      reports.set(report.reportId, fields)
      offsets.set(report.reportId, offset)
    }
    for (const child of collection.children || []) walk(child)
  }
  collections.forEach(walk)
  return { reports, axisCount, buttonCount, flightAxes }
}

function readBits(data: DataView, offset: number, size: number, signed: boolean): number | null {
  if (offset + size > data.byteLength * 8) return null
  let value = 0
  for (let bit = 0; bit < size; bit++) value += ((data.getUint8((offset + bit) >> 3) >> ((offset + bit) & 7)) & 1) * 2 ** bit
  if (signed && value >= 2 ** (size - 1)) value -= 2 ** size
  return value
}

export function decodeHidReport(layout: HidLayout, reportId: number, data: DataView, axes: number[], buttons: number[]): boolean {
  const fields = layout.reports.get(reportId)
  if (!fields?.length) return false
  let changed = false
  for (const field of fields) {
    const raw = readBits(data, field.offset, field.size, field.min < 0)
    if (raw === null) continue
    const fraction = clamp((raw - field.min) / (field.max - field.min), 0, 1)
    const value = field.kind === 'axis' ? fraction * 2 - 1 : fraction
    const target = field.kind === 'axis' ? axes : buttons
    if (target[field.index] !== value) { target[field.index] = value; changed = true }
  }
  return changed
}

export type HidController = {
  id: string; axes: number[]; buttons: number[]; layout: HidLayout; device: HidDeviceLike; reportsReceived: number
  close(): Promise<void>
}

export async function openHidController(device: HidDeviceLike): Promise<HidController> {
  const layout = buildHidLayout(device.collections)
  if (!layout.axisCount && !layout.buttonCount) throw new Error('Bu cihazın HID raporunda okunabilir joystick ekseni veya düğmesi yok.')
  if (!device.opened) await device.open()
  const axes = Array(layout.axisCount).fill(Number.NaN) as number[]
  const buttons = Array(layout.buttonCount).fill(Number.NaN) as number[]
  const controller: HidController = {
    id: `${device.productName} · HID ${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`,
    axes, buttons, layout, device, reportsReceived: 0,
    close: async () => { device.removeEventListener('inputreport', listener); if (device.opened) await device.close() },
  }
  const listener = (event: HidInputEvent) => {
    if (layout.reports.has(event.reportId)) controller.reportsReceived++
    decodeHidReport(layout, event.reportId, event.data, axes, buttons)
  }
  device.addEventListener('inputreport', listener)
  return controller
}
