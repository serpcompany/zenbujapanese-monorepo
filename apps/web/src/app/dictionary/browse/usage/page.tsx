import { categoryIndexRoute } from '../category-index'

const route = categoryIndexRoute('usage')

export const dynamic = 'force-dynamic'

export const metadata = route.metadata

export default route.Page
