import { isSegmentableText, maximumSegmentedLength } from '@zenbu/dictionary-core/cards/segmentable'
import { segmentationFurigana } from '@zenbu/dictionary-core/cards/segmentation'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { fixtureSegmentation } from '@zenbu/dictionary-core/fixtures'
import { log } from '@/lib/log'
import { dictionaryService } from './data'

const furiganaCacheSeconds = 3_600

const unindexed = { 'X-Robots-Tag': 'noindex' }

async function getFurigana(text: string): Promise<RubySegment[] | null> {
  const api = await dictionaryService()
  if (api) return segmentationFurigana((await api.segmentation(text)).data.tokens)
  const tokens = fixtureSegmentation.get(text)
  return tokens ? segmentationFurigana(tokens) : null
}

const refused = (status: number, error: string) =>
  Response.json({ error }, { status, headers: unindexed })

export async function furiganaAnswer(asked: string): Promise<Response> {
  const text = asked.normalize('NFC')
  if (!isSegmentableText(text)) {
    return refused(400, `text must be 1 to ${maximumSegmentedLength} characters`)
  }
  try {
    const furigana = await getFurigana(text)
    if (!furigana) return refused(404, 'Not found')
    return Response.json(
      { furigana },
      { headers: { ...unindexed, 'Cache-Control': `public, max-age=${furiganaCacheSeconds}` } }
    )
  } catch (error) {
    log('warn', 'furigana_unavailable', {
      errorName: error instanceof Error ? error.name : typeof error,
      characters: Array.from(text).length
    })
    return refused(502, 'The dictionary service didn’t answer')
  }
}
