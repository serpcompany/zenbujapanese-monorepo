import { isAbsolute, relative, sep } from 'node:path'
import { findComments } from './comments/find'
import { root } from './files'
import { checkLayers } from './layers'
import { commentRule, layerRule, secretRule, sizeRule } from './rules'
import { findSecrets } from './secrets'
import { checkSizes } from './sizes'

export async function editHook(edited: string): Promise<never> {
  const path = relative(root, edited).split(sep).join('/')
  if (!path || path.startsWith('..') || isAbsolute(path)) process.exit(0)

  const messages: string[] = []
  for (const file of findComments([path]).found) {
    messages.push(
      ...file.comments.map(comment => `${path}:${comment.line}:${comment.column}  ${comment.text}`),
      commentRule
    )
  }
  const sizes = checkSizes([path]).filter(size => size.path === path)
  if (sizes.length) messages.push(...sizes.map(size => `${size.path}  ${size.problem}`), sizeRule)
  const layers = checkLayers([path])
  if (layers.length) {
    messages.push(
      ...layers.map(layer => `${layer.path}:${layer.line}  ${layer.problem}`),
      layerRule
    )
  }
  const secrets = await findSecrets([path])
  if (secrets.length) messages.push(...secrets, secretRule)

  if (messages.length) {
    console.error(messages.join('\n'))
    process.exit(2)
  }
  process.exit(0)
}
