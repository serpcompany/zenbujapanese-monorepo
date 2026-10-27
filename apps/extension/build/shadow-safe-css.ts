import type { AtRule, Container, Plugin } from 'postcss'

const browserRootFontSize = 16
const remLength = /(?<![\w.]|[\w-]-)(\d*\.?\d+)rem\b/g

export function remToPx(value: string): string {
  return value.replace(remLength, (_, amount: string) => {
    const pixels = Number((Number(amount) * browserRootFontSize).toFixed(4))
    return `${pixels}px`
  })
}

function insideTailwindPropertiesLayer(rule: AtRule): boolean {
  const parent = rule.parent as Container | undefined
  return parent?.type === 'atrule' && (parent as AtRule).name === 'layer'
    ? (parent as AtRule).params === 'properties'
    : false
}

function declaresTailwindProperties(rule: AtRule): boolean {
  let found = false
  rule.walkDecls(/^--tw-/, () => {
    found = true
  })
  return found
}

export function shadowSafeCss(appliesTo: (file: string) => boolean = () => true): Plugin {
  return {
    postcssPlugin: 'zenbu-shadow-safe-css',
    OnceExit(root) {
      if (!appliesTo(root.source?.input.file ?? '')) return
      root.walkDecls(declaration => {
        declaration.value = remToPx(declaration.value)
      })
      root.walkAtRules(rule => {
        rule.params = remToPx(rule.params)
      })
      root.walkAtRules('supports', rule => {
        if (insideTailwindPropertiesLayer(rule) && declaresTailwindProperties(rule) && rule.nodes) {
          rule.replaceWith(rule.nodes)
        }
      })
    }
  }
}
