import { scriptIndexRoute } from '../kana-routes'

const route = scriptIndexRoute('katakana')

export const dynamic = 'force-dynamic'

export const generateMetadata = route.generateMetadata

export default route.Page
