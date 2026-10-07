import { and, asc, eq, gt, lt, max, sql } from 'drizzle-orm'
import type { AccountStore, LockedAccount } from '../domain/store'
import type { Drizzle } from './database'
import { syncChanges, syncMutations, users } from './schema'

const profileColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  email: users.email,
  version: users.version,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt
}

const journalColumns = {
  sequence: syncChanges.sequence,
  entityType: syncChanges.entityType,
  entityId: syncChanges.entityId,
  entityVersion: syncChanges.entityVersion,
  operation: syncChanges.operation
}

function takesTheUsername(error: unknown): boolean {
  for (let cause = error; typeof cause === 'object' && cause !== null; ) {
    const { code, constraint } = cause as { code?: unknown; constraint?: unknown }
    if (code === '23505' && constraint === 'users_username_unique') return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

export function accountStore(db: Drizzle): AccountStore {
  return {
    async profile(userId) {
      const [profile] = await db.select(profileColumns).from(users).where(eq(users.id, userId))
      return profile ?? null
    },

    withLockedAccount(userId, work) {
      return db.transaction(async tx => {
        const [profile] = await tx
          .select(profileColumns)
          .from(users)
          .where(eq(users.id, userId))
          .for('update')
        if (!profile) return null
        const account: LockedAccount = {
          profile,
          async saveProfile(next, version) {
            try {
              return await tx.transaction(async savepoint => {
                const [saved] = await savepoint
                  .update(users)
                  .set({ ...next, version, updatedAt: sql`now()` })
                  .where(eq(users.id, userId))
                  .returning(profileColumns)
                if (!saved) throw new Error('the locked account was not there to update')
                return saved
              })
            } catch (error) {
              if (takesTheUsername(error)) return 'username_taken'
              throw error
            }
          },
          async journal(entry) {
            await tx
              .delete(syncChanges)
              .where(
                and(
                  eq(syncChanges.userId, userId),
                  eq(syncChanges.entityType, entry.entityType),
                  eq(syncChanges.entityId, entry.entityId)
                )
              )
            await tx.insert(syncChanges).values({ userId, ...entry })
          },
          async recordedMutation(clientMutationId) {
            const [record] = await tx
              .select()
              .from(syncMutations)
              .where(
                and(
                  eq(syncMutations.userId, userId),
                  eq(syncMutations.clientMutationId, clientMutationId)
                )
              )
            return record ?? null
          },
          async recordMutation(record) {
            await tx.insert(syncMutations).values({ userId, ...record })
          },
          async forgetMutationsOlderThan(days) {
            await tx
              .delete(syncMutations)
              .where(
                and(
                  eq(syncMutations.userId, userId),
                  lt(syncMutations.createdAt, sql`now() - make_interval(days => ${days})`)
                )
              )
          }
        }
        return work(account)
      })
    },

    changesAfter(userId, sequence, limit) {
      return db
        .select(journalColumns)
        .from(syncChanges)
        .where(and(eq(syncChanges.userId, userId), gt(syncChanges.sequence, sequence)))
        .orderBy(asc(syncChanges.sequence))
        .limit(limit)
    },

    async journalHead() {
      const [row] = await db.select({ head: max(syncChanges.sequence) }).from(syncChanges)
      return Number(row?.head ?? 0)
    }
  }
}
