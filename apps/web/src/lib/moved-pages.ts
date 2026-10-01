export const movedPages: Readonly<Record<string, string>> = {
  '/privacy': '/legal/privacy/'
}

export function movedPageResponse(url: URL): Response | null {
  const destination = movedPages[url.pathname.replace(/(.)\/$/, '$1')]
  if (!destination) return null
  const location = new URL(destination, url)
  location.search = url.search
  return Response.redirect(location.href, 308)
}
