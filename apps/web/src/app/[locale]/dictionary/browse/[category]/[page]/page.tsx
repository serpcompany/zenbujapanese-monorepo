import { categoryPagedRoute } from '../../category-routes'

const route = categoryPagedRoute('used')

export const generateMetadata = route.generateMetadata

export default route.Page
