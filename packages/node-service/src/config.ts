export function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`PORT is ${value}`)
  return port
}
