import { categoryIndexRoute } from '../category-index'

const route = categoryIndexRoute('subject')

export const dynamic = 'force-dynamic'

export const generateMetadata = route.generateMetadata

export default route.Page
