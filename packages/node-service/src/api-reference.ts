import {
  anchor,
  cell,
  code,
  fieldList,
  refName,
  type Schema,
  schemaLink,
  shape,
  typeOf
} from './api-schema-text'

interface Parameter {
  name: string
  in: string
  required?: boolean
  description?: string
  schema?: Schema
}

interface Body {
  required?: boolean
  description?: string
  headers?: Record<string, { description?: string; schema?: Schema }>
  content?: Record<string, { schema?: Schema }>
}

interface Operation {
  summary?: string
  description?: string
  security?: Record<string, string[]>[]
  parameters?: Parameter[]
  requestBody?: Body
  responses?: Record<string, Body>
}

interface SyncOperation {
  scopes: string[]
  baseVersion: boolean
  description: string
  fields?: Schema
  example?: unknown
}

interface SyncEntity {
  description: string
  entityId: string
  read: string
  data?: Schema
  operations: Record<string, SyncOperation>
}

type Component = Schema & {
  'x-sync-entities'?: Record<string, SyncEntity>
  'x-sync-rejections'?: Record<string, string>
}

export interface ApiDocument {
  info: { title: string; version: string; description?: string }
  servers?: { url: string; description?: string }[]
  paths?: Record<string, Record<string, Operation>>
  components?: {
    schemas?: Record<string, Component>
    securitySchemes?: Record<string, { type?: string; scheme?: string; description?: string }>
  }
}

export interface ReferenceSource {
  document: string
  regenerate: string
  guide?: { title: string; path: string }
}

interface Route {
  heading: string
  operation: Operation
}

const methods = ['get', 'put', 'post', 'patch', 'delete']
const toRoot = '../../'

const routesOf = (document: ApiDocument): Route[] =>
  Object.entries(document.paths ?? {}).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => methods.includes(method))
      .map(([method, operation]) => ({ heading: `${method.toUpperCase()} ${path}`, operation }))
  )

const routeLink = (route: Route) => `[${code(route.heading)}](#${anchor(route.heading)})`

function resolved(document: ApiDocument, schema: Schema | undefined): Schema | undefined {
  if (!schema?.$ref) return schema
  return document.components?.schemas?.[refName(schema.$ref)]
}

function errorCodes(document: ApiDocument, schema: Schema | undefined): string[] | null {
  const found = resolved(document, schema)
  const variants = found?.anyOf ?? found?.oneOf
  if (variants) {
    const codes = variants.map(variant => errorCodes(document, variant))
    return codes.some(Boolean) ? codes.flatMap(each => each ?? []) : null
  }
  const errorCode = found?.properties?.error?.properties?.code
  if (!errorCode) return null
  return (errorCode.enum ?? []).map(String)
}

const jsonSchema = (body: Body | undefined) => body?.content?.['application/json']?.schema

function auth(operation: Operation): string {
  if (!operation.security?.length) return 'none'
  return operation.security
    .map(requirement =>
      Object.entries(requirement)
        .map(([scheme, scopes]) =>
          scopes.length ? `${code(scheme)} with ${scopes.map(code).join(' and ')}` : code(scheme)
        )
        .join(' and ')
    )
    .join(', or ')
}

function parameters(operation: Operation): string[] {
  return ['header', 'path', 'query'].flatMap(place => {
    const listed = (operation.parameters ?? []).filter(parameter => parameter.in === place)
    if (!listed.length) return []
    const properties = Object.fromEntries(
      listed.map(each => [each.name, { ...each.schema, description: each.description }])
    )
    const required = listed.filter(each => each.required).map(each => each.name)
    return [
      `**${place[0].toUpperCase()}${place.slice(1)} parameters:**`,
      '',
      ...fieldList({ properties, required }),
      ''
    ]
  })
}

function requestBody(document: ApiDocument, operation: Operation): string[] {
  const schema = jsonSchema(operation.requestBody)
  if (!schema) return []
  const required = operation.requestBody?.required ? 'required' : 'optional'
  const named = schema.$ref ? `, ${schemaLink(schema.$ref)}` : ''
  const fields = fieldList(resolved(document, schema) ?? {})
  const empty = fields.length ? [] : ['An empty object, `{}`.', '']
  return [
    `**Body** (JSON, ${required}${named}):`,
    '',
    ...empty,
    ...fields,
    ...(fields.length ? [''] : [])
  ]
}

function meaningsOf(description: string, codes: string[]): [string, string][] | null {
  const marks = codes
    .map(each => ({ code: each, at: description.indexOf(`${code(each)}: `) }))
    .sort((one, other) => one.at - other.at)
  if (marks.some(mark => mark.at < 0)) return null
  return marks.map((mark, index) => [
    mark.code,
    description
      .slice(mark.at + code(mark.code).length + 2, marks[index + 1]?.at ?? description.length)
      .trim()
  ])
}

function answer(document: ApiDocument, status: string, body: Body): string[] {
  const schema = jsonSchema(body)
  const description = cell(body.description ?? '')
  const codes = errorCodes(document, schema)
  if (!codes?.length) {
    const shown = schema ? `, ${shape(schema)}` : ''
    return [`- **${status}**${shown}: ${description}`]
  }
  const meanings = meaningsOf(description, codes)
  if (!meanings) return [`- **${status}** ${codes.map(code).join(', ')}: ${description}`]
  return meanings.map(([each, meaning]) => `- **${status}** ${code(each)}: ${meaning}`)
}

function responses(document: ApiDocument, operation: Operation): string[] {
  const answers = Object.entries(operation.responses ?? {}).flatMap(([status, body]) =>
    answer(document, status, body)
  )
  const headers = Object.entries(operation.responses ?? {}).flatMap(([status, body]) =>
    Object.entries(body.headers ?? {}).map(
      ([name, header]) => `- A ${status} sends ${code(name)}: ${cell(header.description ?? '')}`
    )
  )
  return [
    '**Answers:**',
    '',
    ...answers,
    '',
    ...(headers.length ? ['**Headers:**', '', ...headers, ''] : [])
  ]
}

function route(document: ApiDocument, { heading, operation }: Route): string[] {
  const summary = operation.summary ? [`${operation.summary}.`, ''] : []
  const description = operation.description ? [operation.description, ''] : []
  return [
    `### ${code(heading)}`,
    '',
    ...summary,
    ...description,
    `**Auth:** ${auth(operation)}.`,
    '',
    ...parameters(operation),
    ...requestBody(document, operation),
    ...responses(document, operation)
  ]
}

function header(document: ApiDocument, source: ReferenceSource): string[] {
  const guide = source.guide
    ? [
        `How a client uses these routes, in order, is the [${source.guide.title}](${source.guide.path}).`
      ]
    : []
  return [
    `# ${document.info.title}`,
    '',
    `Written from [${code(source.document)}](${toRoot}${source.document}), the contract's version ${document.info.version}, by ${code('packages/node-service/src/api-reference.ts')}, and a test fails when the two differ. Don't edit it by hand: after changing a route, run ${code('pnpm test -u')} in ${code(source.regenerate)}, and commit both files.`,
    ...(guide.length ? ['', ...guide] : []),
    '',
    ...(document.info.description ? [document.info.description, ''] : [])
  ]
}

function servers(document: ApiDocument): string[] {
  if (!document.servers?.length) return []
  return [
    '## Servers',
    '',
    ...document.servers.map(server => `- ${server.description ?? 'Server'}: ${code(server.url)}`),
    ''
  ]
}

function authentication(document: ApiDocument): string[] {
  const schemes = Object.entries(document.components?.securitySchemes ?? {})
  if (!schemes.length) return []
  return [
    '## Authentication',
    '',
    ...schemes.map(
      ([name, scheme]) =>
        `- ${code(name)} (${[scheme.type, scheme.scheme].filter(Boolean).join(', ')}): ${scheme.description ?? ''}`
    ),
    ''
  ]
}

function routeIndex(routes: Route[]): string[] {
  return [
    '## Routes',
    '',
    '| Route | Auth | What it does |',
    '| --- | --- | --- |',
    ...routes.map(
      each =>
        `| ${routeLink(each)} | ${cell(auth(each.operation))} | ${cell(each.operation.summary ?? '')} |`
    ),
    ''
  ]
}

function operationText(document: ApiDocument, name: string, operation: SyncOperation): string[] {
  const scopes = operation.scopes.map(code).join(' or ')
  const baseVersion = operation.baseVersion ? 'required' : 'not read'
  const fieldSchema = resolved(document, operation.fields)
  const fields = fieldSchema ? fieldList(fieldSchema) : []
  const strict = fieldSchema?.additionalProperties === false ? ', and no others' : ''
  const named = operation.fields?.$ref ? ` (${schemaLink(operation.fields.$ref)})` : ''
  const example = operation.example
    ? ['', '```json', JSON.stringify(operation.example, null, 2), '```']
    : []
  return [
    `**${code(name)}**, with ${scopes}; ${code('baseVersion')} ${baseVersion}. ${operation.description}`,
    ...(fields.length ? ['', `Fields${named}${strict}:`, '', ...fields] : []),
    ...example,
    ''
  ]
}

function syncEntities(document: ApiDocument): string[] {
  const holder = Object.entries(document.components?.schemas ?? {}).find(
    ([, schema]) => schema['x-sync-entities']
  )
  if (!holder) return []
  const [holderName, { 'x-sync-entities': entities = {}, 'x-sync-rejections': rejections = {} }] =
    holder
  return [
    '## Sync entities',
    '',
    `What a ${schemaLink(`#/components/schemas/${holderName}`)} can change. An app reads an entity only with its read scope, and makes an operation only with one of the operation's scopes; anything else is rejected ${code('not_allowed')}.`,
    '',
    ...Object.entries(entities).flatMap(([name, entity]) => [
      `### Entity ${code(name)}`,
      '',
      entity.description,
      '',
      `- **ID** (${code('entityId')}): ${entity.entityId}`,
      `- **Read with:** ${code(entity.read)}`,
      ...(entity.data
        ? [`- **As it is now** (a ${code('put')}'s ${code('data')}): ${typeOf(entity.data)}`]
        : []),
      '',
      ...Object.entries(entity.operations).flatMap(([operation, rule]) =>
        operationText(document, operation, rule)
      )
    ]),
    ...(Object.keys(rejections).length
      ? [
          '### Rejected mutations',
          '',
          `A ${code('rejected')} result's ${code('error.code')}. A rejection is final for that mutation ID.`,
          '',
          '| Code | Meaning |',
          '| --- | --- |',
          ...Object.entries(rejections).map(
            ([each, meaning]) => `| ${code(each)} | ${cell(meaning)} |`
          ),
          ''
        ]
      : [])
  ]
}

function errorIndex(document: ApiDocument, routes: Route[]): string[] {
  const where = new Map<string, Map<string, Set<string>>>()
  for (const each of routes) {
    for (const [status, answer] of Object.entries(each.operation.responses ?? {})) {
      for (const found of errorCodes(document, jsonSchema(answer)) ?? []) {
        const statuses = where.get(found) ?? new Map<string, Set<string>>()
        statuses.set(status, (statuses.get(status) ?? new Set()).add(routeLink(each)))
        where.set(found, statuses)
      }
    }
  }
  if (!where.size) return []
  return [
    '## Error codes',
    '',
    `Every ${code('error.code')} a route answers, with its status. Branch on the code; show or log the ${code('message')}.`,
    '',
    '| Code | Status | Routes |',
    '| --- | --- | --- |',
    ...[...where.keys()]
      .sort()
      .flatMap(found =>
        [...(where.get(found) ?? [])].map(
          ([status, linked]) => `| ${code(found)} | ${status} | ${[...linked].join(', ')} |`
        )
      ),
    ''
  ]
}

function schemas(document: ApiDocument): string[] {
  const listed = Object.entries(document.components?.schemas ?? {})
  if (!listed.length) return []
  return [
    '## Schemas',
    '',
    ...listed.flatMap(([name, schema]) => {
      const fields = fieldList(schema)
      const kind = schema.anyOf || schema.oneOf ? ['One of:', ''] : []
      const plain = fields.length || schema.properties ? [] : [`${typeOf(schema)}.`, '']
      return [
        `### ${name}`,
        '',
        ...(schema.description ? [schema.description, ''] : []),
        ...plain,
        ...(fields.length ? [...kind, ...fields, ''] : [])
      ]
    })
  ]
}

export function apiReference(document: ApiDocument, source: ReferenceSource): string {
  const routes = routesOf(document)
  const lines = [
    ...header(document, source),
    ...servers(document),
    ...authentication(document),
    ...routeIndex(routes),
    ...routes.flatMap(each => route(document, each)),
    ...syncEntities(document),
    ...errorIndex(document, routes),
    ...schemas(document)
  ]
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
}
