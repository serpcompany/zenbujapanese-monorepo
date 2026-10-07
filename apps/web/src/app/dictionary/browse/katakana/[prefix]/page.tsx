import { kanaRoute } from '../../kana-routes'

const route = kanaRoute('katakana')

export const generateMetadata = route.generateMetadata

export default route.Page
