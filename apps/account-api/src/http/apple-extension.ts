import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { appleReturnForExtensions, clientOfExtension } from '../domain/clients'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { refusal } from './refusals'
import { bodyLimitKb } from './route-answers'

const stateSeparator = '.'

const forwarded = ['id_token', 'code', 'user', 'state', 'error'] as const

const AppleReturnSchema = z
  .object({
    state: z
      .string()
      .min(1)
      .max(512)
      .openapi({
        description: `The extension's ID, as the extension sent it to Apple, alone or followed by \`${stateSeparator}\` and a value of the extension's own. Sent on whole.`
      }),
    id_token: z.string().max(16_384).optional().openapi({ description: "Apple's ID token." }),
    code: z.string().max(1024).optional().openapi({
      description: "Apple's authorization code: DELETE /v1/me takes it as `appleAuthorizationCode`."
    }),
    user: z.string().max(4096).optional().openapi({
      description: "The learner's name and email as JSON. Apple sends it on the first sign-in only."
    }),
    error: z.string().max(256).optional().openapi({
      description: "Apple's error, such as `user_cancelled_authorize`, in place of the rest."
    })
  })
  .openapi('AppleExtensionReturn')

const appleReturn = createRoute({
  method: 'post',
  path: appleReturnForExtensions,
  summary: "Sign in with Apple's return, for the browser extension",
  description:
    'The Return URL a browser extension gives Apple, with `response_mode=form_post`. Apple posts its answer here as a form, and the service answers `303` to `https://<extension ID>.chromiumapp.org/apple`, with the fields Apple sent in the fragment, for an extension ID the service lists. It checks no origin and no token, sets no cookie, and stores nothing: the extension signs in with the ID token on POST /v1/auth/sign-in/social, as an app does.',
  request: {
    body: {
      description:
        "Apple's form post, with the fields of [`AppleExtensionReturn`](#appleextensionreturn).",
      content: { 'application/x-www-form-urlencoded': { schema: AppleReturnSchema } },
      required: true
    }
  },
  responses: {
    303: {
      description:
        'Sent on to the extension: `Location` is its chromiumapp.org URL, with each of `id_token`, `code`, `user`, `state` and `error` that Apple sent in the fragment, form-encoded.',
      headers: {
        location: {
          description: 'https://<extension ID>.chromiumapp.org/apple#<the fields>',
          schema: { type: 'string' as const }
        }
      }
    },
    400: refusal({
      bad_request: "The form isn't Apple's, or a field is too long. Nothing was sent on.",
      unknown_extension: "`state` doesn't name an extension the service lists. Nothing was sent on."
    }),
    413: refusal({ too_large: `The body is over ${bodyLimitKb} KB.` }),
    415: refusal({ bad_request: "The body isn't a form. Nothing was sent on." })
  }
})

const extensionNamedBy = (state: string) => state.split(stateSeparator, 1)[0] ?? ''

export function appleExtensionRoutes(app: OpenAPIHono<AccountEnv>) {
  app.openapi(appleReturn, context => {
    const form = context.req.valid('form')
    const extensionId = extensionNamedBy(form.state)
    if (!clientOfExtension(extensionId)) {
      return context.json(
        errorBody('unknown_extension', "That isn't an extension this service signs in."),
        400
      )
    }
    const fields = new URLSearchParams()
    for (const name of forwarded) {
      const value = form[name]
      if (value !== undefined) fields.set(name, value)
    }
    context.header('cache-control', 'no-store')
    context.header('referrer-policy', 'no-referrer')
    return context.redirect(`https://${extensionId}.chromiumapp.org/apple#${fields}`, 303)
  })
}
