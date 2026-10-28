import { ScanText } from 'lucide-react'
import { EmptyState } from '../side-panel/empty-tab'
import { labels } from '../side-panel/labels'

export function ImageSearchPage() {
  return <EmptyState icon={ScanText} text={labels.empty.imageSearch} className="h-full" />
}
