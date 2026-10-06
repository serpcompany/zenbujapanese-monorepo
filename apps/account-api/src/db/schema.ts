import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

const moment = (name: string) => timestamp(name, { withTimezone: true })
const created = () => moment('created_at').notNull().defaultNow()
const updated = () => moment('updated_at').notNull().defaultNow()
const key = () => uuid('id').primaryKey().defaultRandom()
const owner = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

export const users = pgTable('users', {
  id: key(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: created(),
  updatedAt: updated()
})

export const userIdentities = pgTable(
  'user_identities',
  {
    id: key(),
    userId: owner(),
    providerId: text('provider').notNull(),
    accountId: text('subject').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: moment('access_token_expires_at'),
    refreshTokenExpiresAt: moment('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: created(),
    updatedAt: updated()
  },
  table => [
    uniqueIndex('user_identities_provider_subject').on(table.providerId, table.accountId),
    index('user_identities_user_id').on(table.userId)
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    id: key(),
    userId: owner(),
    token: text('token').notNull().unique(),
    expiresAt: moment('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: created(),
    updatedAt: updated()
  },
  table => [index('sessions_user_id').on(table.userId)]
)

export const verifications = pgTable(
  'verifications',
  {
    id: key(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: moment('expires_at').notNull(),
    createdAt: created(),
    updatedAt: updated()
  },
  table => [index('verifications_identifier').on(table.identifier)]
)

export const signingKeys = pgTable('signing_keys', {
  id: key(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  alg: text('alg'),
  crv: text('crv'),
  createdAt: created(),
  expiresAt: moment('expires_at')
})

export const rateLimits = pgTable('rate_limits', {
  id: key(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull()
})

export const authSchema = {
  user: users,
  account: userIdentities,
  session: sessions,
  verification: verifications,
  jwks: signingKeys,
  rateLimit: rateLimits
}
