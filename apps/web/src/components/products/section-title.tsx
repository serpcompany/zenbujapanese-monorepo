import { Fill } from '@/components/fill'

export const sectionTitleClassName =
  'text-2xl font-semibold tracking-tight text-balance md:text-3xl'

export function SectionTitle({ title, aside }: { title: string; aside: string }) {
  return (
    <h2 className={sectionTitleClassName}>
      <Fill
        template={title}
        values={{ aside: <span className="text-muted-foreground">{aside}</span> }}
      />
    </h2>
  )
}
