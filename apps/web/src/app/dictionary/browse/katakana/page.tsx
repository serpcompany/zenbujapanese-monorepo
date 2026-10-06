import { scriptIndexRoute } from '../kana-routes'

const route = scriptIndexRoute('katakana')

export const generateMetadata = route.generateMetadata

export default route.Page
