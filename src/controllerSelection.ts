// Prefer dedicated RC controllers over keyboard-like HID peripherals.
// Explicit controller selection always takes precedence over this automatic ranking.
export type ControllerCandidate = {
  id: string
  index: number
  axes: readonly unknown[]
  buttons: readonly unknown[]
}

export function controllerPriority(pad: ControllerCandidate): number {
  const name = pad.id.toLowerCase()
  const keyboardLike = /\b(n-key|keyboard|keypad|kbd)\b/.test(name)
  const radioLink = /\b(t12d|radiolink)\b/.test(name)
  const directHid = name.includes(' · hid ')
  const axisScore = Math.min(pad.axes.length, 16)
  const buttonScore = Math.min(pad.buttons.length, 16)
  if (keyboardLike) return -1000 + axisScore
  if (radioLink) return 1000 + (directHid ? 100 : 0) + axisScore + buttonScore
  return (directHid ? 0 : 50) + axisScore + buttonScore
}

export function choosePreferredPad<T extends ControllerCandidate>(pads: readonly T[], selectedIndex: number | null): T | undefined {
  if (selectedIndex !== null) return pads.find(pad => pad.index === selectedIndex)
  return [...pads].sort((a, b) => controllerPriority(b) - controllerPriority(a) || a.index - b.index)[0]
}
