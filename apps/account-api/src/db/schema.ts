import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'

const moment = (name: string) => timestamp(name, { withTimezone: true })
const created = () => moment('created_at').notNull().defaultNow()
const updated = () => moment('updated_at').notNull().defaultNow()
const key = () => text('id').primaryKey()
const owner = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

export const users = pgTable(
  'users',
  {
    id: key(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    username: text('username').unique(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    createdAt: created(),
    updatedAt: updated()
  },
  table => [uniqueIndex('users_email_ignoring_case').on(sql`lower(${table.email})`)]
)

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
    clientId: text('client_id'),
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

export const syncChanges = pgTable(
  'sync_changes',
  {
    sequence: bigint('sequence', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: owner(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    entityVersion: bigint('entity_version', { mode: 'number' }).notNull(),
    operation: text('operation').notNull(),
    changedAt: moment('changed_at').notNull().defaultNow()
  },
  table => [
    index('sync_changes_user_sequence').on(table.userId, table.sequence),
    uniqueIndex('sync_changes_entity').on(table.userId, table.entityType, table.entityId)
  ]
)

export const syncMutations = pgTable(
  'sync_mutations',
  {
    userId: owner(),
    clientMutationId: text('client_mutation_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    operation: text('operation').notNull(),
    requestSha256: text('request_sha256').notNull(),
    outcome: text('outcome').notNull(),
    resultingServerVersion: bigint('resulting_server_version', { mode: 'number' }),
    errorCode: text('error_code'),
    createdAt: created()
  },
  table => [
    primaryKey({ columns: [table.userId, table.clientMutationId] }),
    index('sync_mutations_user_created').on(table.userId, table.createdAt)
  ]
)

export const knownWords = pgTable(
  'known_words',
  {
    userId: owner(),
    itemId: text('item_id').notNull(),
    headword: text('headword').notNull(),
    reading: text('reading').notNull(),
    known: boolean('known').notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    updatedAt: updated()
  },
  table => [primaryKey({ columns: [table.userId, table.itemId] })]
)

export const wordLists = pgTable(
  'word_lists',
  {
    userId: owner(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    version: bigint('version', { mode: 'number' }).notNull(),
    createdAt: created(),
    updatedAt: updated()
  },
  table => [primaryKey({ columns: [table.userId, table.id] })]
)

export const listWords = pgTable(
  'list_words',
  {
    userId: owner(),
    listId: text('list_id').notNull(),
    itemId: text('item_id').notNull(),
    headword: text('headword').notNull(),
    reading: text('reading').notNull(),
    present: boolean('present').notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    addedAt: moment('added_at').notNull().defaultNow(),
    updatedAt: updated()
  },
  table => [primaryKey({ columns: [table.userId, table.listId, table.itemId] })]
)

export const watchedVideos = pgTable(
  'watched_videos',
  {
    userId: owner(),
    videoId: text('video_id').notNull(),
    title: text('title'),
    author: text('author'),
    duration: doublePrecision('duration'),
    position: doublePrecision('position'),
    comprehension: doublePrecision('comprehension'),
    watchedAt: moment('watched_at'),
    status: text('status', { enum: ['watched', 'removed', 'pruned'] }).notNull(),
    version: bigint('version', { mode: 'number' }).notNull(),
    updatedAt: updated()
  },
  table => [primaryKey({ columns: [table.userId, table.videoId] })]
)

export const syncOrigin = pgTable('sync_origin', {
  databaseOid: bigint('database_oid', { mode: 'number' }).primaryKey()
})

export const authSchema = {
  user: users,
  account: userIdentities,
  session: sessions,
  verification: verifications,
  jwks: signingKeys,
  rateLimit: rateLimits
}
