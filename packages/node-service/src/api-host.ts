const accountServicePaths = ['/v1/auth', '/v1/me', '/v1/sync', '/v1/health'] as const

const serviceOwnPaths = ['/healthz', '/dev/mail'] as const

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

export function servedByAccountService(path: string): boolean {
  return accountServicePaths.some(prefix => under(path, prefix))
}

export function servedByEachServiceItself(path: string): boolean {
  return serviceOwnPaths.some(prefix => under(path, prefix))
}
