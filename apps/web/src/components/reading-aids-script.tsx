import { readingAidsScript } from '@/lib/reading-aids'

export function ReadingAidsScript() {
  return <script dangerouslySetInnerHTML={{ __html: readingAidsScript }} />
}
