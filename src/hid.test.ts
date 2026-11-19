import { describe, expect, it } from 'vitest'
import { buildHidLayout, decodeHidReport, type HidCollection } from './hid'

describe('descriptor-driven HID controller input', () => {
  it('reads the eight 16-bit T12D axes from the same report layout as Windows', () => {
    const layout = buildHidLayout([{ usagePage: 1, usage: 5, children: [], inputReports: [{ reportId: 0, items: [
      { reportSize: 8, reportCount: 3, logicalMinimum: 0, logicalMaximum: 255, isConstant: true },
      { reportSize: 16, reportCount: 8, logicalMinimum: 0, logicalMaximum: 2048,
        usages: Array.from({ length: 8 }, (_, index) => 0x10030 + index) },
    ] }] }])
    const data = new DataView(new ArrayBuffer(19))
    const axes: number[] = [], buttons: number[] = []
    // Resting values observed in the physical USB report. WebHID strips the leading report ID.
    data.setUint16(3 + 4 * 2, 1024, true)
    data.setUint16(3 + 6 * 2, 1024, true)
    decodeHidReport(layout, 0, data, axes, buttons)
    expect(axes).toEqual([-1, -1, -1, -1, 0, -1, 0, -1])
    // An independent synthetic sweep shows that all four stick positions are decoded when transmitted.
    for (const [index, value] of [2048, 1024, 512, 1536].entries()) data.setUint16(3 + index * 2, value, true)
    decodeHidReport(layout, 0, data, axes, buttons)
    expect(axes.slice(0, 4)).toEqual([1, 0, -.5, .5])
  })
  it('decodes twelve unaligned analog axes and packed buttons', () => {
    const collection: HidCollection = {
      usagePage: 1, usage: 4, children: [], inputReports: [{ reportId: 1, items: [
        { usagePage: 9, usageMinimum: 1, reportSize: 1, reportCount: 4, logicalMinimum: 0, logicalMaximum: 1 },
        { usages: Array.from({ length: 12 }, (_, index) => 0xff010001 + index), reportSize: 16, reportCount: 12, logicalMinimum: 0, logicalMaximum: 4095 },
      ] }],
    }
    const layout = buildHidLayout([collection])
    expect(layout.axisCount).toBe(12)
    expect(layout.buttonCount).toBe(4)
    const bytes = new Uint8Array(25)
    bytes[0] = 0b00000101
    // Axis 12 begins after four button bits and eleven 16-bit axes.
    const offset = 4 + 11 * 16
    const value = 4095
    for (let bit = 0; bit < 16; bit++) if ((value >> bit) & 1) bytes[(offset + bit) >> 3] |= 1 << ((offset + bit) & 7)
    const axes = Array(12).fill(0), buttons = Array(4).fill(0)
    expect(decodeHidReport(layout, 1, new DataView(bytes.buffer), axes, buttons)).toBe(true)
    expect(axes[11]).toBe(1)
    expect(buttons).toEqual([1, 0, 1, 0])
    expect(decodeHidReport(layout, 2, new DataView(bytes.buffer), axes, buttons)).toBe(false)
  })
  it('handles signed and constant fields', () => {
    const layout = buildHidLayout([{ usagePage: 1, usage: 4, children: [], inputReports: [{ reportId: 0, items: [
      { usagePage: 1, reportSize: 8, reportCount: 1, logicalMinimum: 0, logicalMaximum: 255, isConstant: true },
      { usagePage: 1, usages: [0x30], reportSize: 8, reportCount: 1, logicalMinimum: -127, logicalMaximum: 127 },
    ] }] }])
    const axes = [0], buttons: number[] = []
    decodeHidReport(layout, 0, new DataView(new Uint8Array([55, 0x81]).buffer), axes, buttons)
    expect(axes[0]).toBe(-1)
  })
  it('uses the usage page encoded by browsers and ignores relative controls and the hat switch', () => {
    const layout = buildHidLayout([{ usagePage: 1, usage: 4, children: [], inputReports: [{ reportId: 1, items: [
      { usages: [0x10030], reportSize: 8, reportCount: 1, logicalMinimum: 0, logicalMaximum: 255, isAbsolute: false },
      { usages: [0x10039], reportSize: 8, reportCount: 1, logicalMinimum: 0, logicalMaximum: 7 },
      { usages: [0x200bb], reportSize: 8, reportCount: 1, logicalMinimum: 0, logicalMaximum: 255 },
      { usages: [0x90001], reportSize: 1, reportCount: 1, logicalMinimum: 0, logicalMaximum: 1 },
    ] }] }])
    const axes = [NaN], buttons = [NaN]
    decodeHidReport(layout, 1, new DataView(new Uint8Array([9, 4, 255, 1]).buffer), axes, buttons)
    expect(layout.flightAxes.throttle).toBe('axis:0')
    expect(axes).toEqual([1])
    expect(buttons).toEqual([1])
  })
})
