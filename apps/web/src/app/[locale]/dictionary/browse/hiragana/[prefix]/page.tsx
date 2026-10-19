import { kanaRoute } from '../../kana-routes'

const route = kanaRoute('hiragana')

export const generateMetadata = route.generateMetadata

export default route.Page
