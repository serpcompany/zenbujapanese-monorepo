import { browseHomePath } from './dictionary/browse/sitemap'
import { sitePages } from './pages'

export const pagesSitemapPaths = [...sitePages.map(page => page.path), browseHomePath]
