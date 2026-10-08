import { browsePath } from './dictionary/browse/paths'
import { sitePages } from './pages'

export const pagesSitemapPaths = [...sitePages.map(page => page.path), browsePath]
