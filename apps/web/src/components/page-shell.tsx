import type { ReactNode } from 'react'

/** Unstyled text page. Visual design comes after the mockup rounds (#402). */
export function PageShell({
  title,
  updated,
  children
}: {
  title: string
  updated?: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <article className="flex flex-col gap-4 [&_a]:underline [&_h2]:mt-4 [&_h2]:font-medium [&_h2]:text-lg [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {updated ? <p className="text-sm text-muted-foreground">Effective {updated}</p> : null}
        {children}
      </article>
    </main>
  )
}
