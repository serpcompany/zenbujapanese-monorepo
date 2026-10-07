import type { ReactNode } from 'react'

export function AccountPageShell({
  title,
  intro,
  children
}: {
  title: string
  intro: ReactNode | null
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 [&_a]:underline">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {intro ? <div className="text-muted-foreground">{intro}</div> : null}
      </div>
      {children}
    </main>
  )
}

export function AccountUnavailable() {
  return (
    <output className="block">
      Signing in to a Zenbu account isn’t available on this site yet.
    </output>
  )
}

export function OtherAccountPages({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 text-sm text-muted-foreground">{children}</div>
}
