'use client'

import { recentFirst } from '@zenbu/account-rules/account-views'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { shownDuration, shownMoment, textIn, youTubeVideo } from '@/lib/account/synced-views'
import { fill } from '@/lib/i18n/format'
import { type AreaProps, Rows } from './parts'

export function RecentVideos({ copy, locale, text }: AreaProps) {
  const words = text.synced.recentVideos
  const videos = recentFirst(copy.held('watchedVideo'), 'watchedAt')
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.recentVideos.title}>
      <Rows empty={videos.length === 0 ? words.none : null} problem={null}>
        {videos.map(({ entityId, data }) => {
          const { position, duration } = data
          const author = textIn(data, 'author')
          return (
            <Item key={entityId} variant="outline">
              <ItemContent>
                <ItemTitle>
                  <a href={youTubeVideo(entityId)}>{textIn(data, 'title') || words.untitled}</a>
                </ItemTitle>
                {author ? <ItemDescription>{author}</ItemDescription> : null}
                <ItemDescription>
                  {fill(words.watched, { date: shownMoment(data, 'watchedAt', locale) })}
                  {typeof position === 'number' && typeof duration === 'number'
                    ? ` · ${fill(words.progress, {
                        position: shownDuration(position),
                        duration: shownDuration(duration)
                      })}`
                    : null}
                </ItemDescription>
              </ItemContent>
            </Item>
          )
        })}
      </Rows>
    </section>
  )
}

export function Bookmarks({ copy, locale, text }: AreaProps) {
  const words = text.synced.bookmarks
  const sentences = recentFirst(copy.held('bookmarkedSentence'), 'bookmarkedAt')
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.bookmarks.title}>
      <Rows empty={sentences.length === 0 ? words.none : null} problem={null}>
        {sentences.map(({ entityId, data }) => {
          const language = data.language === 'ja' ? 'ja' : 'en'
          const translation = textIn(data, 'translation')
          return (
            <Item key={entityId} variant="outline">
              <ItemContent>
                <ItemTitle lang={language}>{textIn(data, 'text')}</ItemTitle>
                {translation ? <p className="text-sm">{translation}</p> : null}
                <ItemDescription>
                  {words.language[language]} ·{' '}
                  {fill(words.bookmarked, { date: shownMoment(data, 'bookmarkedAt', locale) })}
                </ItemDescription>
              </ItemContent>
            </Item>
          )
        })}
      </Rows>
    </section>
  )
}
