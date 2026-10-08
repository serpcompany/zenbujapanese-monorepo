export interface Schema {
  $ref?: string
  type?: string | string[]
  format?: string
  description?: string
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  additionalProperties?: boolean | Schema
  propertyNames?: Schema
  enum?: unknown[]
  const?: unknown
  anyOf?: Schema[]
  oneOf?: Schema[]
  allOf?: Schema[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minItems?: number
  maxItems?: number
  pattern?: string
  default?: unknown
}

const literal = (value: unknown) => `\`${JSON.stringify(value)}\``

export const code = (text: string) => `\`${text}\``

export const refName = (ref: string) => ref.split('/').at(-1) ?? ref

export const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')

export const schemaLink = (ref: string) => `[${code(refName(ref))}](#${anchor(refName(ref))})`

const variantsOf = (schema: Schema) => schema.anyOf ?? schema.oneOf ?? []

const isObject = (schema: Schema) => schema.type === 'object' || schema.properties !== undefined

const hasInlineObjects = (schema: Schema): boolean =>
  !schema.$ref &&
  (schema.properties !== undefined ||
    variantsOf(schema).some(variant => !variant.$ref && isObject(variant)) ||
    (schema.items !== undefined && hasInlineObjects(schema.items)))

const types = (schema: Schema) =>
  Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []

function joined(words: string[]): string {
  if (words.length < 3) return words.join(' or ')
  return `${words.slice(0, -1).join(', ')}, or ${words.at(-1)}`
}

const number = (value: number) => value.toLocaleString('en-US')

function between(least: number | undefined, most: number | undefined, unit: string): string[] {
  if (least !== undefined && most !== undefined) {
    return [`${number(least)} to ${number(most)}${unit}`]
  }
  if (least !== undefined) return [`at least ${number(least)}${unit}`]
  if (most !== undefined) return [`at most ${number(most)}${unit}`]
  return []
}

function rules(schema: Schema): string[] {
  const found = [
    ...between(schema.minLength, schema.maxLength, ' characters'),
    ...between(schema.minimum, schema.maximum, ''),
    ...between(schema.minItems, schema.maxItems, ' items')
  ]
  if (schema.exclusiveMinimum !== undefined)
    found.push(`more than ${number(schema.exclusiveMinimum)}`)
  if (schema.exclusiveMaximum !== undefined)
    found.push(`less than ${number(schema.exclusiveMaximum)}`)
  if (schema.pattern !== undefined) found.push(`matching ${code(schema.pattern)}`)
  if (schema.propertyNames) found.push(...rules(schema.propertyNames).map(rule => `keys ${rule}`))
  if (schema.default !== undefined) found.push(`default ${literal(schema.default)}`)
  return found
}

export function typeOf(schema: Schema): string {
  if (schema.$ref) return schemaLink(schema.$ref)
  if (schema.const !== undefined) return literal(schema.const)
  if (schema.enum) return joined(schema.enum.map(literal))
  const variants = variantsOf(schema)
  if (variants.length) return joined(variants.map(typeOf))
  const named = types(schema).map(type => {
    if (type === 'array') return schema.items ? `array of ${typeOf(schema.items)}` : 'array'
    if (type === 'string' && schema.format) return `string (${schema.format})`
    if (
      type === 'object' &&
      typeof schema.additionalProperties === 'object' &&
      !schema.properties
    ) {
      return `map to ${typeOf(schema.additionalProperties)}`
    }
    return type
  })
  if (!named.length && isObject(schema)) return 'object'
  return named.length ? joined(named) : 'any JSON'
}

export function shape(schema: Schema): string {
  if (schema.$ref || !isObject(schema) || !schema.properties) {
    const variants = variantsOf(schema)
    return variants.length ? joined(variants.map(shape)) : typeOf(schema)
  }
  const fields = Object.entries(schema.properties).map(([name, field]) => {
    const optional = schema.required?.includes(name) ? '' : '?'
    return `${name}${optional}: ${field.properties ? shape(field) : typeOf(field)}`
  })
  return `{ ${fields.join(', ')} }`
}

const indented = (text: string, depth: number) =>
  text
    .split('\n')
    .map(line => `${'  '.repeat(depth)}${line}`)
    .join('\n')

function described(head: string, description: string | undefined, depth: number): string {
  if (!description) return indented(`- ${head}`, depth)
  const [first, ...rest] = description.trim().split('\n')
  const opening = first.startsWith('- ') ? `- ${head}:\n  ${first}` : `- ${head}: ${first}`
  return indented([opening, ...rest.map(line => `  ${line}`)].join('\n'), depth)
}

function labelOf(variant: Schema): string {
  const fixed = Object.entries(variant.properties ?? {}).filter(
    ([, field]) => field.const !== undefined || field.enum?.length === 1
  )
  return fixed.length
    ? fixed
        .map(([name, field]) => `${code(name)} ${literal(field.const ?? field.enum?.[0])}`)
        .join(', ')
    : typeOf(variant)
}

export function fieldList(schema: Schema, depth = 0): string[] {
  const variants = variantsOf(schema)
  if (variants.length && !schema.properties) {
    if (!hasInlineObjects(schema)) return []
    return variants.flatMap(variant => [
      indented(`- ${variant.$ref ? schemaLink(variant.$ref) : labelOf(variant)}`, depth),
      ...(variant.$ref ? [] : fieldList(variant, depth + 1))
    ])
  }
  if (schema.items && hasInlineObjects(schema.items)) return fieldList(schema.items, depth)
  return Object.entries(schema.properties ?? {}).flatMap(([name, field]) => {
    const head = [typeOf(field), schema.required?.includes(name) ? 'required' : 'optional']
    const facts = [...head, ...rules(field)].join(', ')
    const nested = hasInlineObjects(field) ? fieldList(field, depth + 1) : []
    return [described(`${code(name)} (${facts})`, field.description, depth), ...nested]
  })
}

export function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')
}
