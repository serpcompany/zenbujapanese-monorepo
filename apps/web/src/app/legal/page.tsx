import { PageList } from '@/components/page-list'
import { pageMetadata } from '@/lib/metadata'
import { legalPages } from '@/lib/pages'

export const metadata = pageMetadata('/legal/')

export default function LegalPage() {
  return <PageList title="Legal" pages={legalPages} />
}
