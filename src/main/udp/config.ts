export const UDP_ADDRESS = '127.0.0.1'
export const DEFAULT_UDP_PORT = 20777

export function readUdpPort(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_UDP_PORT
  if (!/^\d+$/.test(value)) return null
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}
