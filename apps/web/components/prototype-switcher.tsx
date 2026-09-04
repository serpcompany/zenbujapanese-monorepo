"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

const variants = [
  { key: "A", name: "Quiet reference" },
  { key: "B", name: "Split preview" },
  { key: "C", name: "Compact index" },
] as const

export function PrototypeSwitcher({ current }: { current: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentIndex = Math.max(0, variants.findIndex((variant) => variant.key === current))

  const select = useCallback(
    (offset: number) => {
      const nextIndex = (currentIndex + offset + variants.length) % variants.length
      const params = new URLSearchParams(searchParams.toString())
      params.set("variant", variants[nextIndex].key)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [currentIndex, pathname, router, searchParams],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("input, textarea, [contenteditable='true']")) return
      if (event.key === "ArrowLeft") select(-1)
      if (event.key === "ArrowRight") select(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [select])

  if (process.env.NODE_ENV === "production") return null

  return (
    <aside
      aria-label="Prototype variant switcher"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-neutral-950 p-1.5 text-white shadow-2xl"
    >
      <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15 hover:text-white" onClick={() => select(-1)} aria-label="Previous variant">
        <ArrowLeft />
      </Button>
      <div className="min-w-36 px-2 text-center text-xs font-medium sm:min-w-44">
        {variants[currentIndex].key} — {variants[currentIndex].name}
      </div>
      <Button variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/15 hover:text-white" onClick={() => select(1)} aria-label="Next variant">
        <ArrowRight />
      </Button>
    </aside>
  )
}
