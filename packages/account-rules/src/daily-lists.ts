const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/
const idPattern = /^00000000-da11-4000-8000-0000(\d{4})(\d{2})(\d{2})$/i

function existingDay(year: string, month: string, date: string): string | null {
  const moment = new Date(0)
  moment.setUTCFullYear(Number(year), Number(month) - 1, Number(date))
  const exists =
    moment.getUTCFullYear() === Number(year) &&
    moment.getUTCMonth() === Number(month) - 1 &&
    moment.getUTCDate() === Number(date)
  return exists ? `${year}-${month}-${date}` : null
}

export function dailyListId(day: string): string | null {
  const parts = dayPattern.exec(day)
  if (!parts) return null
  const [, year = '', month = '', date = ''] = parts
  return existingDay(year, month, date)
    ? `00000000-da11-4000-8000-0000${year}${month}${date}`
    : null
}

export function dailyListDay(id: string): string | null {
  const parts = idPattern.exec(id)
  if (!parts) return null
  const [, year = '', month = '', date = ''] = parts
  return existingDay(year, month, date)
}
