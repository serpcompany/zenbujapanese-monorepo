import { categoryIndexRoute } from '../category-index'

const route = categoryIndexRoute('partOfSpeech')

export const dynamic = 'force-dynamic'

export const metadata = route.metadata

export default route.Page
