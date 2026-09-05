"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const variants = ["A", "B", "C"] as const
const names = { A: "Open results", B: "Tabbed groups", C: "Progressive detail" }

export function PrototypeSwitcher({ current }: { current: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const safeCurrent = variants.includes(current as (typeof variants)[number]) ? current as (typeof variants)[number] : "A"

  const hrefFor = useCallback((step: number) => {
    const nextIndex = (variants.indexOf(safeCurrent) + step + variants.length) % variants.length
    const params = new URLSearchParams(searchParams.toString())
    params.set("variant", variants[nextIndex])
    return `${pathname}?${params.toString()}`
  }, [pathname, safeCurrent, searchParams])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches("input, textarea, [contenteditable='true']")) return
      if (event.key === "ArrowLeft") window.location.assign(hrefFor(-1))
      if (event.key === "ArrowRight") window.location.assign(hrefFor(1))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [hrefFor])

  if (process.env.NODE_ENV === "production") return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-foreground p-1.5 text-background shadow-xl">
      <Button aria-label="Previous variant" nativeButton={false} render={<a href={hrefFor(-1)} title="Previous variant (Left arrow)" />} size="icon-sm" variant="ghost"><ArrowLeft /></Button>
      <Badge className="bg-background text-foreground" variant="outline">{safeCurrent} · {names[safeCurrent]}</Badge>
      <Button aria-label="Next variant" nativeButton={false} render={<a href={hrefFor(1)} title="Next variant (Right arrow)" />} size="icon-sm" variant="ghost"><ArrowRight /></Button>
    </div>
  )
}
