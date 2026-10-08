export interface PageNumber {
  number: number
  onPhone: boolean
  gapBefore: { wide: boolean; phone: boolean }
}

const wideWindow = 2
const phoneWindow = 0

function shownPages(page: number, pages: number, window: number): number[] {
  const first = Math.max(1, page - window)
  const last = Math.min(pages, page + window)
  const around = Array.from({ length: last - first + 1 }, (_, index) => first + index)
  return [...new Set([1, ...around, pages])]
}

const gapBefore = (shown: number[], number: number) => {
  const index = shown.indexOf(number)
  return index > 0 && number - shown[index - 1] > 1
}

export function pageNumbers(page: number, pages: number): PageNumber[] {
  const wide = shownPages(page, pages, wideWindow)
  const phone = shownPages(page, pages, phoneWindow)
  return wide.map(number => ({
    number,
    onPhone: phone.includes(number),
    gapBefore: { wide: gapBefore(wide, number), phone: gapBefore(phone, number) }
  }))
}
