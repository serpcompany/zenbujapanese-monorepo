'use client'

import { recentFirst, type Shown, wordsOfList } from '@zenbu/account-rules/account-views'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Result } from '@/lib/account/client'
import { photoQueue } from '@/lib/account/photo-queue'
import { shownMoment, textIn } from '@/lib/account/synced-views'
import { fill } from '@/lib/i18n/format'
import { type AreaProps, ItemLink, Rows } from './parts'

type Picture = { kind: 'waiting' } | { kind: 'shown'; url: string } | { kind: 'missing' }

function useSeen() {
  const frame = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const shown = frame.current
    if (!shown || typeof IntersectionObserver === 'undefined') return setSeen(true)
    const watching = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setSeen(true)
    })
    watching.observe(shown)
    return () => watching.disconnect()
  }, [])
  return { frame, seen }
}

function PhotoFile({
  photo,
  missing,
  load
}: {
  photo: Shown
  missing: string
  load: (photoId: string) => Promise<Result<Blob>>
}) {
  const [picture, setPicture] = useState<Picture>({ kind: 'waiting' })
  const { frame, seen } = useSeen()
  useEffect(() => {
    if (!seen) return
    let url: string | null = null
    let live = true
    void load(photo.entityId).then(file => {
      if (!live) return
      if (!file.ok) return setPicture({ kind: 'missing' })
      url = URL.createObjectURL(file.value)
      setPicture({ kind: 'shown', url })
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [seen, photo.entityId, load])
  return (
    <div
      ref={frame}
      className="muted-surface relative flex aspect-square w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted"
    >
      {picture.kind === 'shown' ? (
        <Image
          src={picture.url}
          alt={textIn(photo.data, 'name')}
          fill
          unoptimized
          className="object-cover"
        />
      ) : null}
      {picture.kind === 'missing' ? (
        <p className="p-2 text-center text-xs text-muted-foreground">{missing}</p>
      ) : null}
    </div>
  )
}

export function MediaLibrary({ copy, locale, text, photoFile }: AreaProps) {
  const words = text.synced.mediaLibrary
  const load = useMemo(() => photoQueue(photoFile), [photoFile])
  const photos = recentFirst(copy.held('photo'), 'savedAt')
  const photoWords = copy.held('photoWord')
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.mediaLibrary.title}>
      <Rows empty={photos.length === 0 ? words.none : null} problem={null}>
        {photos.map(photo => (
          <Item key={photo.entityId} variant="outline" className="items-start">
            <PhotoFile photo={photo} missing={words.missing} load={load} />
            <ItemContent>
              <ItemTitle>{textIn(photo.data, 'name')}</ItemTitle>
              <ItemDescription>
                {fill(words.saved, { date: shownMoment(photo.data, 'savedAt', locale) })}
              </ItemDescription>
              <p className="text-sm">{words.on}</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {wordsOfList(photoWords, photo.entityId).map(word => (
                  <li key={word.entityId}>
                    <ItemLink data={word.data} locale={locale} />
                  </li>
                ))}
              </ul>
            </ItemContent>
          </Item>
        ))}
      </Rows>
    </section>
  )
}
