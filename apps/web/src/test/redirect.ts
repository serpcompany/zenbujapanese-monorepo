type Navigation = typeof import('next/navigation')

export class Redirect extends Error {
  constructor(readonly path: string) {
    super(`redirects to ${path}`)
  }
}

export async function redirectingNavigation(original: () => Promise<Navigation>) {
  return {
    ...(await original()),
    permanentRedirect: (path: string) => {
      throw new Redirect(path)
    }
  }
}

export const redirectOf = (opened: Promise<unknown>) =>
  opened.then(
    () => null,
    (error: unknown) => {
      if (error instanceof Redirect) return error.path
      throw error
    }
  )
