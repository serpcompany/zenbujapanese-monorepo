import type { Locator } from '@playwright/test'

export function textContrast(text: Locator, upTo: string | null = null) {
  return text.evaluate((element, upTo) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const paint = canvas.getContext('2d', { willReadFrequently: true })
    if (!paint) throw new Error('No canvas')
    const rgba = (colour: string) => {
      paint.clearRect(0, 0, 1, 1)
      paint.fillStyle = colour
      paint.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
      return { rgb: [r, g, b], alpha: a / 255 }
    }
    const layers: Element[] = []
    for (let at: Element | null = element; at; ) {
      layers.unshift(at)
      if (upTo && at.matches(upTo)) break
      const root = at.getRootNode()
      at = at.parentElement ?? (root instanceof ShadowRoot ? root.host : null)
    }
    const background = layers.reduce(
      (under, layer) => {
        const { rgb, alpha } = rgba(getComputedStyle(layer).backgroundColor)
        return under.map((channel, index) => rgb[index] * alpha + channel * (1 - alpha))
      },
      [255, 255, 255]
    )
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(channel => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const { rgb, alpha } = rgba(getComputedStyle(element).color)
    const shown = rgb.map((channel, index) => channel * alpha + background[index] * (1 - alpha))
    const [light, dark] = [luminance(shown), luminance(background)].sort((a, b) => b - a)
    return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100
  }, upTo)
}
