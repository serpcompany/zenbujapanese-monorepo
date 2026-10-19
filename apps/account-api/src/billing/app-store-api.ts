import {
  AppStoreServerAPIClient,
  Environment,
  type LastTransactionsItem
} from '@apple/app-store-server-library'
import { log } from '@zenbu/node-service/log'
import type { AppStoreApiKey } from '../billing-config'

export type AppStoreApiClients = (environment: Environment) => AppStoreServerAPIClient

const hour = 60 * 60 * 1000
const historyWindowMs = 80 * hour
const mostHistoryPages = 50

export function appStoreApiClients(key: AppStoreApiKey, bundleId: string): AppStoreApiClients {
  const clients = new Map<Environment, AppStoreServerAPIClient>()
  return environment => {
    const known = clients.get(environment)
    if (known) return known
    const client = new AppStoreServerAPIClient(
      key.privateKey,
      key.keyId,
      key.issuerId,
      bundleId,
      environment
    )
    clients.set(environment, client)
    return client
  }
}

export function appStoreApi(clients: AppStoreApiClients) {
  return {
    async latest(
      environment: Environment,
      originalTransactionId: string
    ): Promise<LastTransactionsItem | null> {
      try {
        const statuses =
          await clients(environment).getAllSubscriptionStatuses(originalTransactionId)
        const items = (statuses.data ?? []).flatMap(group => group.lastTransactions ?? [])
        return items.find(item => item.originalTransactionId === originalTransactionId) ?? null
      } catch (error) {
        log('warn', "apple: the App Store Server API didn't give a subscription's status", {
          error: error instanceof Error ? error.name : 'unknown'
        })
        return null
      }
    },

    async recent(environment: Environment, now: Date): Promise<string[]> {
      const request = { startDate: now.getTime() - historyWindowMs, endDate: now.getTime() }
      const payloads: string[] = []
      let paginationToken: string | undefined
      try {
        for (let page = 0; page < mostHistoryPages; page++) {
          const answer = await clients(environment).getNotificationHistory(
            paginationToken ?? null,
            request
          )
          for (const item of answer.notificationHistory ?? []) {
            if (item.signedPayload) payloads.push(item.signedPayload)
          }
          if (!answer.hasMore || !answer.paginationToken) break
          paginationToken = answer.paginationToken
        }
      } catch (error) {
        log('warn', "apple: the App Store Server API didn't give the notification history", {
          error: error instanceof Error ? error.name : 'unknown'
        })
      }
      return payloads
    }
  }
}

export const apiEnvironments: Partial<Record<string, Environment>> = {
  Production: Environment.PRODUCTION,
  Sandbox: Environment.SANDBOX
}
