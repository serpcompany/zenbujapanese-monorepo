export function FormMessage({ problem }: { problem: string | null }) {
  if (!problem) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {problem}
    </p>
  )
}

export function Notice({ children }: { children: string | null }) {
  if (!children) return null
  return <output className="block text-sm text-muted-foreground">{children}</output>
}
