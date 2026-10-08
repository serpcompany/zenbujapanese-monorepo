export const sectionTitleClassName =
  'text-2xl font-semibold tracking-tight text-balance md:text-3xl'

export function SectionTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <h2 className={sectionTitleClassName}>
      {aside ? `${title} ` : title}
      {aside ? <span className="text-muted-foreground">{aside}</span> : null}
    </h2>
  )
}
