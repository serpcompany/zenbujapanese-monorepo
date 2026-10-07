import { categoryRoute } from '../category-routes'

const route = categoryRoute('used')

export const generateMetadata = route.generateMetadata

export default route.Page
