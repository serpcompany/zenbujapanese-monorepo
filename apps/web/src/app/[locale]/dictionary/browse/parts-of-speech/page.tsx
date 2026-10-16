import { categoryIndexRoute } from '../category-index'

const route = categoryIndexRoute('partOfSpeech')

export const dynamic = 'force-dynamic'

export const generateMetadata = route.generateMetadata

export default route.Page
