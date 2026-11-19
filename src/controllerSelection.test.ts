import { describe, expect, it } from 'vitest'
import { choosePreferredPad, controllerPriority, type ControllerCandidate } from './controllerSelection'

const gamepad: ControllerCandidate = {
  id: 'T12D Joystick (Vendor: 0483 Product: 5750)', index: 0,
  axes: Array(8).fill(0), buttons: Array(24).fill(0),
}
const radiolinkHid: ControllerCandidate = {
  id: 'T12D Joystick · HID 0483:5750', index: -1,
  axes: Array(8).fill(0), buttons: [],
}
const keyboardHid: ControllerCandidate = {
  id: 'N-KEY Device · HID 0b05:19b6', index: -2,
  axes: Array(32).fill(0), buttons: [],
}

describe('automatic RC controller selection', () => {
  it('never picks a keyboard-like 32-axis HID over the actual RadioLink T12D', () => {
    const pads = [keyboardHid, gamepad, radiolinkHid]
    expect(choosePreferredPad(pads, null)?.id).toBe(radiolinkHid.id)
    expect(controllerPriority(radiolinkHid)).toBeGreaterThan(controllerPriority(keyboardHid))
  })

  it('prefers the T12D Gamepad connection when WebHID reports are not present', () => {
    expect(choosePreferredPad([keyboardHid, gamepad], null)?.id).toBe(gamepad.id)
  })

  it('honors explicit device selection, even if another device is ranked higher', () => {
    const pads = [gamepad, radiolinkHid, keyboardHid]
    expect(choosePreferredPad(pads, gamepad.index)?.index).toBe(0)
    expect(choosePreferredPad(pads, keyboardHid.index)?.id).toBe(keyboardHid.id)
    expect(choosePreferredPad(pads, 999)).toBeUndefined()
  })

  it('does not change automatic selection due to stick motion alone', () => {
    const pads = [radiolinkHid, keyboardHid]
    expect(choosePreferredPad(pads, null)?.id).toBe(radiolinkHid.id)
    keyboardHid.axes[4] = 1
    radiolinkHid.axes[1] = -.8
    expect(choosePreferredPad(pads, null)?.id).toBe(radiolinkHid.id)
  })

  it('still supports generic gamepads and handles no connected devices', () => {
    const generic = { id: 'Xbox Controller', index: 3, axes: Array(4).fill(0), buttons: Array(12).fill(0) }
    expect(choosePreferredPad([keyboardHid, generic], null)?.id).toBe(generic.id)
    expect(choosePreferredPad([], null)).toBeUndefined()
  })
})
