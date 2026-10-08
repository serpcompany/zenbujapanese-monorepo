import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import { clients } from '../domain/clients'
import type { AccountEnv } from './env'
import { json, refusal } from './refusals'

const body = <T>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true }
})

const moment = z.iso.datetime()
const done = (key: 'success' | 'status') => z.object({ [key]: z.literal(true) })

const SignedInUserSchema = z
  .looseObject({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    createdAt: moment,
    updatedAt: moment
  })
  .openapi('SignedInUser', {
    description: 'Who signed in. GET /v1/me has the profile, with the username and version.'
  })

const SessionSchema = z
  .looseObject({
    id: z.string(),
    userId: z.string(),
    token: z.string().openapi({
      description:
        "The session's bare token, which names it to POST /v1/auth/revoke-session. It signs nothing in: only the signed one in `set-auth-token` does."
    }),
    expiresAt: moment,
    createdAt: moment,
    updatedAt: moment,
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable()
  })
  .openapi('Session')

const SignInSchema = z
  .looseObject({
    token: z.string().openapi({
      description:
        "The session's bare token. Keep the signed one from the `set-auth-token` header instead: it is the refresh token."
    }),
    user: SignedInUserSchema
  })
  .openapi('SignIn')

const signedIn = {
  ...json(SignInSchema, 'Signed in.'),
  headers: {
    'set-auth-token': {
      description:
        'The signed session token: the refresh token, good for 60 days from its last use. Send it as `Authorization: Bearer` to GET /v1/auth/token for an access token.',
      schema: { type: 'string' as const }
    }
  }
}

const IdTokenSchema = z
  .object({
    token: z
      .string()
      .openapi({ description: 'The ID token Sign in with Apple or Google gave the device.' }),
    nonce: z.string().openapi({
      description: 'The nonce from POST /v1/auth/sign-in/nonce, passed to Apple or Google.'
    }),
    user: z
      .object({
        name: z.object({ firstName: z.string(), lastName: z.string() }).partial().optional()
      })
      .optional()
      .openapi({
        description:
          "The name Apple gives an app or the website only on the learner's first sign-in to it. Apple's token has none, so it names a new account."
      })
  })
  .openapi('IdToken')

const webReturn = {
  callbackURL: z.string().optional().openapi({
    description:
      "The website's page the browser comes back to from Google, on one of the website's origins."
  }),
  errorCallbackURL: z.string().optional().openapi({
    description:
      'Where it comes back instead when signing in fails, with `?error=` and a code, such as `account_not_linked`, `account_already_linked_to_different_user`, `access_denied`, `state_mismatch`, or `EMAIL_NOT_VERIFIED`, which may come in capitals, so compare it ignoring case and treat any other as a failed sign-in. A missing state, or a callback reused or reloaded, ends at GET /v1/auth/error instead, a JSON `404 not_found`.'
  })
}

const WebSignInSchema = z.object({ url: z.url(), redirect: z.literal(true) }).openapi('WebSignIn')

const provider = z.enum(['apple', 'google'])

const unknownClient =
  "No `X-Zenbu-Client`, or one the service doesn't list, from outside the website's origins."

const appSigningIn = z.object({
  'x-zenbu-client': z
    .enum(clients.map(client => client.id) as [string, ...string[]])
    .optional()
    .openapi({
      description:
        "The app signing in: its access is the account's, limited to the app's scopes. A browser on one of the website's origins may leave it out."
    })
})

const malformed = {
  validation_error: 'A field is missing, or of the wrong type; `message` names it.'
}
const limited = refusal({
  too_many_requests:
    'Too many requests from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.'
})
const signedOut = { unauthorized: 'No session, or one that has ended: sign in again.' }
const notFresh = {
  session_not_fresh: 'The session is over 10 minutes old: sign the learner in again first.'
}
const noScope = (scope: string) => ({
  insufficient_scope: `The session's app doesn't have \`${scope}\`.`
})
const badNonce = {
  invalid_nonce: 'The nonce is unknown, already used, or over 10 minutes old. Ask for a new one.'
}
const badToken = {
  invalid_token:
    "Apple's or Google's token is malformed, expired, over an hour old, signed by another key or issuer, made for another app, or made for another nonce."
}
const sessionToken = (...scopes: string[]) => [{ sessionToken: scopes }]
const managing = {
  401: refusal(signedOut),
  403: refusal(noScope('account')),
  429: limited
}

export const signInRoutes = {
  sendCode: createRoute({
    method: 'post',
    path: '/v1/auth/email-otp/send-verification-otp',
    summary: 'Email a sign-in code',
    description:
      'Answers the same whether or not the email has an account. Five codes per address in 10 minutes.',
    request: body(z.object({ email: z.email(), type: z.literal('sign-in') })),
    responses: {
      200: json(done('success'), 'Sent, or nothing to send.'),
      400: refusal({
        ...malformed,
        invalid_email: "`email` isn't an email address.",
        sign_in_only: "`type` isn't `sign-in`: a code is sent only to sign in."
      }),
      429: refusal({
        too_many_requests:
          'Five codes went to this email in the last 10 minutes, or too many came from this address. Wait the seconds `Retry-After` (or `X-Retry-After`) says.'
      }),
      503: refusal({ email_unavailable: 'No email sender is set up.' })
    }
  }),
  signInWithCode: createRoute({
    method: 'post',
    path: '/v1/auth/sign-in/email-otp',
    summary: 'Sign in with the emailed code',
    description:
      "Makes the account on the first sign-in. A `name` is used only then, held to the profile's name rule. Sent with a session from the last 10 minutes, as `Authorization: Bearer`, it adds the email as a way in to that session's account instead, which needs the session's app to have `account`; the account's email is told.",
    request: {
      ...body(z.object({ email: z.email(), otp: z.string(), name: z.string().optional() })),
      headers: appSigningIn
    },
    responses: {
      200: signedIn,
      400: refusal({
        ...malformed,
        invalid_otp: 'The code is wrong, or was used.',
        otp_expired: 'The code is over 10 minutes old. Ask for a new one.',
        unknown_client: unknownClient
      }),
      403: refusal({
        account_not_linked:
          'An Apple or Google account has this email: sign in that way, then add the email.',
        too_many_attempts: 'Five wrong guesses used the code up. Ask for a new one.',
        ...noScope('account')
      }),
      429: limited
    }
  }),
  nonce: createRoute({
    method: 'post',
    path: '/v1/auth/sign-in/nonce',
    summary: 'A nonce for one Apple or Google sign-in',
    request: body(z.object({})),
    responses: {
      200: json(
        z.object({ nonce: z.string(), expiresIn: z.int() }),
        'Pass `nonce` to Apple or Google; it works once, within `expiresIn` seconds.'
      ),
      429: limited
    }
  }),
  signInWithProvider: createRoute({
    method: 'post',
    path: '/v1/auth/sign-in/social',
    summary: 'Sign in with Apple or Google',
    description:
      "With `idToken`, signs in with the token the device got, and makes the account on the first sign-in. Without it, starts the web sign-in, which comes back to GET /v1/auth/callback/{id}. A new account's email must be verified by the provider, and an email that already has an account is refused until the learner adds this way while signed in.",
    request: {
      ...body(
        z.object({
          provider,
          idToken: IdTokenSchema.optional(),
          ...webReturn
        })
      ),
      headers: appSigningIn
    },
    responses: {
      200: {
        ...signedIn,
        ...json(
          z.union([SignInSchema, WebSignInSchema]),
          'Signed in, or, without `idToken`, the provider page to send the browser to.'
        )
      },
      400: refusal({
        ...malformed,
        nonce_required: '`idToken` has no `nonce`.',
        unknown_client: unknownClient
      }),
      401: refusal({
        ...badNonce,
        ...badToken,
        oauth_link_error:
          'That email has an account through another way in: sign in that way, then add this one.'
      }),
      403: refusal({
        email_not_verified: "The provider hasn't verified the email, so it can't make an account.",
        client_mismatch: "The Apple token was made for another app's bundle ID."
      }),
      404: refusal({
        provider_not_found: "`provider` is neither `apple` nor `google`, or isn't set up here."
      }),
      429: limited
    }
  }),
  providerCallback: createRoute({
    method: 'get',
    path: '/v1/auth/callback/{id}',
    summary: "Where Apple's or Google's web sign-in comes back",
    request: { params: z.object({ id: provider }) },
    responses: { 302: { description: 'On to the `callbackURL` the sign-in started with.' } }
  }),
  linkProvider: createRoute({
    method: 'post',
    path: '/v1/auth/link-social',
    summary: 'Add Apple or Google as another way to sign in',
    description:
      "Needs a sign-in from the last 10 minutes. The account email is told. Without `idToken`, the website starts Google's sign-in, which comes back to `callbackURL` with the way added.",
    security: sessionToken('account'),
    request: body(z.object({ provider, idToken: IdTokenSchema.optional(), ...webReturn })),
    responses: {
      200: json(
        z.union([z.looseObject({ status: z.literal(true) }), WebSignInSchema]),
        'Added, or, without `idToken`, the provider page to send the browser to.'
      ),
      400: refusal(malformed),
      401: refusal({ ...signedOut, ...badNonce, ...badToken }),
      403: refusal({ ...notFresh, ...noScope('account') }),
      429: limited
    }
  }),
  unlink: createRoute({
    method: 'post',
    path: '/v1/auth/unlink-account',
    summary: 'Remove a way to sign in',
    description:
      "Needs a sign-in from the last 10 minutes. The last way never goes. The account's email is told.",
    security: sessionToken('account'),
    request: body(
      z.object({
        accountId: z.string().openapi({
          description:
            "The way in's `id` from GET /v1/auth/list-accounts, not its provider's subject."
        })
      })
    ),
    responses: {
      200: json(done('status'), 'Removed.'),
      400: refusal({
        ...malformed,
        failed_to_unlink_last_account:
          "It's the account's last way in, or the account has no way in with that `id`.",
        account_not_found: 'The account has no way in with that `id`.'
      }),
      401: refusal(signedOut),
      403: refusal({ ...notFresh, ...noScope('account') }),
      429: limited
    }
  }),
  accessToken: createRoute({
    method: 'get',
    path: '/v1/auth/token',
    summary: 'A 15-minute access token for /v1/me, /v1/sync, and the other services',
    security: sessionToken(),
    responses: {
      200: json(
        z.object({ token: z.string() }),
        'An EdDSA JWT naming the account (`sub`), the app (`azp`), its scopes (`scope`), and the sign-in (`auth_time`), good for 15 minutes (`exp`).'
      ),
      401: refusal({
        ...signedOut,
        sign_in_again: 'The session belongs to no app the service lists. Sign in again.'
      }),
      429: limited
    }
  }),
  keys: createRoute({
    method: 'get',
    path: '/v1/auth/jwks',
    summary: 'The keys an access token is checked with',
    responses: {
      200: json(
        z.object({ keys: z.array(z.looseObject({ kid: z.string(), alg: z.string() })) }),
        'A JWKS.'
      ),
      429: limited
    }
  }),
  session: createRoute({
    method: 'get',
    path: '/v1/auth/get-session',
    summary: 'The session the token names',
    security: sessionToken('profile'),
    responses: {
      403: refusal(noScope('profile')),
      429: limited,
      200: json(
        z.object({ session: SessionSchema, user: SignedInUserSchema }).nullable(),
        'The session, or `null` with no valid one.'
      )
    }
  }),
  signOut: createRoute({
    method: 'post',
    path: '/v1/auth/sign-out',
    summary: 'End this session',
    security: sessionToken(),
    request: body(z.object({})),
    responses: { 200: json(done('success'), 'Signed out, or there was no session.'), 429: limited }
  }),
  identities: createRoute({
    method: 'get',
    path: '/v1/auth/list-accounts',
    summary: 'The ways this account signs in',
    security: sessionToken('account'),
    responses: {
      200: json(
        z.array(
          z
            .looseObject({
              id: z.string(),
              providerId: z.string().openapi({ description: '`apple`, `google`, or `email`.' }),
              accountId: z.string(),
              userId: z.string(),
              createdAt: moment,
              updatedAt: moment
            })
            .openapi('Identity')
        ),
        'Each way in.'
      ),
      ...managing
    }
  }),
  sessions: createRoute({
    method: 'get',
    path: '/v1/auth/list-sessions',
    summary: 'Where this account is signed in',
    security: sessionToken('account'),
    responses: {
      200: json(z.array(SessionSchema), 'Each session.'),
      ...managing
    }
  }),
  revokeSession: createRoute({
    method: 'post',
    path: '/v1/auth/revoke-session',
    summary: 'Sign one session out',
    security: sessionToken('account'),
    request: body(
      z.object({
        token: z.string().openapi({ description: "A session's `token` from list-sessions." })
      })
    ),
    responses: {
      200: json(done('status'), 'Signed out.'),
      400: refusal(malformed),
      ...managing
    }
  }),
  revokeSessions: createRoute({
    method: 'post',
    path: '/v1/auth/revoke-sessions',
    summary: 'Sign every session out, this one too',
    security: sessionToken('account'),
    request: body(z.object({})),
    responses: {
      200: json(done('status'), 'Signed out.'),
      ...managing
    }
  }),
  revokeOtherSessions: createRoute({
    method: 'post',
    path: '/v1/auth/revoke-other-sessions',
    summary: 'Sign every other session out',
    security: sessionToken('account'),
    request: body(z.object({})),
    responses: {
      200: json(done('status'), 'Signed out.'),
      ...managing
    }
  })
}

export function signInContract(app: OpenAPIHono<AccountEnv>) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionToken', {
    type: 'http',
    scheme: 'bearer',
    description:
      "The signed session token from a sign-in's `set-auth-token` header. Send it only to /v1/auth."
  })
  for (const route of Object.values(signInRoutes)) app.openAPIRegistry.registerPath(route)
}
