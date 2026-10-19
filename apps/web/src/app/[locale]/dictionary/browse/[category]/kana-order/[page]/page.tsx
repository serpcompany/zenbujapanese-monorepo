import { categoryPagedRoute } from '../../../category-routes'

const route = categoryPagedRoute('kana')

export const generateMetadata = route.generateMetadata

export default route.Page
