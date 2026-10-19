import { kanaPagedRoute } from '../../../kana-routes'

const route = kanaPagedRoute('hiragana')

export const generateMetadata = route.generateMetadata

export default route.Page
