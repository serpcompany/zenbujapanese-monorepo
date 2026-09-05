"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";

const variants = [
  { key: "A", name: "Lexical briefs" },
  { key: "B", name: "Definition bands" },
  { key: "C", name: "Progressive outline" },
] as const;

export function PrototypeSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentIndex = Math.max(0, variants.findIndex(({ key }) => key === current));

  const move = useCallback(
    (step: number) => {
      const next = variants[(currentIndex + step + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`?${params.toString()}`);
    },
    [currentIndex, router, searchParams],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  const active = variants[currentIndex];

  return (
    <aside
      aria-label="Prototype variant switcher"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-neutral-950 p-1.5 text-white shadow-2xl"
    >
      <Button
        aria-label="Previous design"
        className="rounded-full text-white hover:bg-white/15 hover:text-white"
        onClick={() => move(-1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowLeft />
      </Button>
      <div className="min-w-40 px-2 text-center text-xs font-medium sm:min-w-52 sm:text-sm">
        {active.key} — {active.name}
      </div>
      <Button
        aria-label="Next design"
        className="rounded-full text-white hover:bg-white/15 hover:text-white"
        onClick={() => move(1)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowRight />
      </Button>
    </aside>
  );
}
