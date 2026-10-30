import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { AccountEnv } from './env'
import { json, refusal } from './refusals'
import {
  appSigningIn,
  body,
  limited,
  malformed,
  sessionToken,
  signedIn,
  signedOut,
  unknownClient
} from './sign-in-contract'

export const extensionCodeRoutes = {
  extensionCode: createRoute({
    method: 'post',
    path: '/v1/auth/extension-code',
    summary: 'A code that signs the browser extension in',
    description:
      "Needs the website's session, from one of the website's origins. The website hands the code straight to the extension, which signs in with it at POST /v1/auth/sign-in/extension-code. It works once, only for `zenbu-extension`, within `expiresIn` seconds. The website never logs it, keeps it, or puts it in a URL.",
    security: sessionToken(),
    request: body(z.object({})),
    responses: {
      200: json(
        z.object({ code: z.string(), expiresIn: z.int() }).openapi('ExtensionCode'),
        'Hand `code` to the extension.'
      ),
      401: refusal(signedOut),
      403: refusal({
        website_only: "The session isn't the website's: only the website hands out a code.",
        invalid_origin: "The cookie came from outside the website's origins."
      }),
      429: limited
    }
  }),
  signInWithExtensionCode: createRoute({
    method: 'post',
    path: '/v1/auth/sign-in/extension-code',
    summary: "Sign the browser extension in with the website's code",
    description:
      "The extension's own session, with its own scopes, for the account signed in on the website. It counts as signed in when the website's session did, so it is no fresher. Signing either out leaves the other signed in.",
    request: {
      ...body(
        z.object({ code: z.string().openapi({ description: 'The code the website handed over.' }) })
      ),
      headers: appSigningIn
    },
    responses: {
      200: signedIn,
      400: refusal({ ...malformed, unknown_client: unknownClient }),
      401: refusal({
        invalid_code:
          'The code is unknown, was used, or the website session that asked for it has ended: ask the website for a new one.',
        code_expired: 'The code is over 5 minutes old: ask the website for a new one.'
      }),
      403: refusal({
        client_mismatch:
          'The code signs in only `zenbu-extension`, and is spent: ask the website for a new one.'
      }),
      429: limited
    }
  })
}

export function extensionCodeContract(app: OpenAPIHono<AccountEnv>) {
  for (const route of Object.values(extensionCodeRoutes)) app.openAPIRegistry.registerPath(route)
}
