import { cn } from '@/lib/utils'

export function SectionHeading({
  id,
  title,
  aside,
  description,
  className
}: {
  id: string
  title: string
  aside?: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('flex max-w-2xl flex-col gap-2.5', className)}>
      <h2
        id={id}
        className="text-[1.625rem] leading-tight font-semibold tracking-tight text-balance md:text-[2rem]"
      >
        {title}
        {aside ? (
          <>
            {' '}
            <span className="text-muted-foreground">{aside}</span>
          </>
        ) : null}
      </h2>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
    </div>
  )
}
