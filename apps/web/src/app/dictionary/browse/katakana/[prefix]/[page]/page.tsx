import { kanaPagedRoute } from '../../../kana-routes'

const route = kanaPagedRoute('katakana')

export const generateMetadata = route.generateMetadata

export default route.Page
