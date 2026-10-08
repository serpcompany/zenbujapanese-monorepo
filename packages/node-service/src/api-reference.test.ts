import { describe, expect, test } from 'vitest'
import { type ApiDocument, apiReference } from './api-reference'

const error = (codes: string[]) => ({
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: { code: { type: 'string', enum: codes }, message: { type: 'string' } },
      required: ['code', 'message']
    }
  },
  required: ['error']
})

const json = (schema: object, description: string) => ({
  description,
  content: { 'application/json': { schema } }
})

const document: ApiDocument = {
  info: { title: 'A service', version: '2', description: 'What it does.' },
  servers: [{ url: 'https://api.example.com', description: 'Production' }],
  paths: {
    '/v1/things/{id}': {
      patch: {
        summary: 'Change a thing',
        security: [{ token: ['things:write'] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z]+$' },
            description: 'Which thing.'
          }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } }
        },
        responses: {
          '200': {
            ...json({ $ref: '#/components/schemas/Thing' }, 'The thing.'),
            headers: { etag: { description: 'Its version.' } }
          },
          '400': json(
            error(['bad_request', 'too_long']),
            '`bad_request`: Not JSON. `too_long`: Over the limit.'
          ),
          '429': json(error(['busy']), 'Wait.')
        }
      }
    }
  },
  components: {
    securitySchemes: { token: { type: 'http', scheme: 'bearer', description: 'A token.' } },
    schemas: {
      Thing: {
        type: 'object',
        description: 'A thing.',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 10_000,
            description: 'Its name.\n- one\n- two'
          },
          size: { type: ['integer', 'null'], minimum: 0 },
          parts: {
            type: 'array',
            maxItems: 5,
            items: { type: 'object', properties: { kind: { const: 'leaf' } }, required: ['kind'] }
          }
        },
        required: ['name']
      },
      Change: {
        oneOf: [
          {
            type: 'object',
            properties: {
              operation: { const: 'put' },
              data: { $ref: '#/components/schemas/Thing' }
            }
          },
          { type: 'object', properties: { operation: { const: 'delete' } } }
        ]
      },
      Mutation: {
        type: 'object',
        properties: { entity: { type: 'string' } },
        'x-sync-entities': {
          thing: {
            description: 'A thing that syncs.',
            entityId: 'Its name.',
            read: 'things:read',
            data: { $ref: '#/components/schemas/Thing' },
            operations: {
              rename: {
                scopes: ['things:write', 'things:rename'],
                baseVersion: true,
                description: 'Only at its version.',
                fields: { $ref: '#/components/schemas/Thing' },
                example: { entity: 'thing', operation: 'rename' }
              }
            }
          }
        },
        'x-sync-rejections': {
          too_many_things: 'The account has too many.',
          bad_path: 'A path such as a|b or C:\\ is refused.'
        }
      }
    }
  }
}

const reference = apiReference(document, {
  document: 'apps/example/openapi.json',
  regenerate: 'apps/example',
  guide: { title: 'guide', path: '../agents/guide.md' }
})

describe('the API reference', () => {
  test('names where it comes from, how to write it again, and the guide', () => {
    expect(reference).toMatch(/^# A service\n/)
    expect(reference).toContain('[`apps/example/openapi.json`](../../apps/example/openapi.json)')
    expect(reference).toContain("the contract's version 2")
    expect(reference).toContain('run `pnpm test -u` in `apps/example`')
    expect(reference).toContain('[guide](../agents/guide.md)')
    expect(reference).toContain('- Production: `https://api.example.com`')
    expect(reference).toContain('- `token` (http, bearer): A token.')
  })

  test('names the file to change when the contract is declared apart from the routes', () => {
    const declared = apiReference(document, {
      document: 'apps/example/openapi.json',
      regenerate: 'apps/example',
      contract: 'apps/example/src/contract.ts'
    })
    expect(declared).toContain(
      "Don't edit it by hand: after changing a route, change its contract in `apps/example/src/contract.ts` too, then run `pnpm test -u` in `apps/example`"
    )
  })

  test('lists each route with its auth, parameters, body, and each answer and code', () => {
    expect(reference).toContain(
      '| [`PATCH /v1/things/{id}`](#patch-v1thingsid) | `token` with `things:write` | Change a thing |'
    )
    expect(reference).toContain('### `PATCH /v1/things/{id}`')
    expect(reference).toContain('- `id` (string, required, matching `^[a-z]+$`): Which thing.')
    expect(reference).toContain('**Body** (JSON, required, [`Thing`](#thing)):')
    expect(reference).toContain('- **200**, [`Thing`](#thing): The thing.')
    expect(reference).toContain('- **400** `bad_request`: Not JSON.')
    expect(reference).toContain('- **400** `too_long`: Over the limit.')
    expect(reference).toContain('- **429** `busy`: Wait.')
    expect(reference).toContain('- A 200 sends `etag`: Its version.')
  })

  test("gives each field its type, whether it's required, its bounds, and its description", () => {
    expect(reference).toContain(
      '- `name` (string, required, 1 to 10,000 characters): Its name.\n  - one\n  - two'
    )
    expect(reference).toContain('- `size` (integer or null, optional, at least 0)')
    expect(reference).toContain('- `parts` (array of object, optional, at most 5 items)')
    expect(reference).toContain('  - `kind` (`"leaf"`, required)')
    expect(reference).toContain('- `operation` `"put"`\n  - `operation` (`"put"`, optional)')
  })

  test('renders the sync entities, their rejections, and an index of error codes', () => {
    expect(reference).toContain('### Entity `thing`')
    expect(reference).toContain('- **Read with:** `things:read`')
    expect(reference).toContain(
      '**`rename`**, with `things:write` or `things:rename`; `baseVersion` required. Only at its version.'
    )
    expect(reference).toContain('Fields ([`Thing`](#thing)):')
    expect(reference).toContain('"operation": "rename"')
    expect(reference).toContain('| `too_many_things` | The account has too many. |')
    expect(reference).toContain('| `bad_path` | A path such as a\\|b or C:\\\\ is refused. |')
    expect(reference).toContain(
      '| `too_long` | 400 | [`PATCH /v1/things/{id}`](#patch-v1thingsid) |'
    )
  })
})
