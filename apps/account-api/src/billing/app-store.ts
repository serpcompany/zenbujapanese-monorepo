import {
  Environment,
  type JWSRenewalInfoDecodedPayload,
  NotificationTypeV2,
  type ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus
} from '@apple/app-store-server-library'
import { log } from '@zenbu/node-service/log'
import { decodeJwt } from 'jose'
import type { AppStoreEnvironment, AppStoreSettings } from '../billing-config'
import type { DeviceTransaction, ProviderEvent, StoreBilling, Verified } from '../domain/billing'
import {
  type AppStoreApiClients,
  apiEnvironments,
  appStoreApi,
  appStoreApiClients
} from './app-store-api'
import {
  type AppleTransaction,
  appleLedger,
  appleState,
  appStoreSource,
  isSubscriptionTransaction
} from './app-store-states'
import appleRoots from './apple-root-certificates.json'

export interface AppStoreConfig extends AppStoreSettings {
  bundleId: string
}

export interface AppStoreTrust {
  rootCertificates: readonly Buffer[]
  onlineChecks: boolean
  apiClients?: AppStoreApiClients
}

export const appleTrust: AppStoreTrust = {
  rootCertificates: Object.values(appleRoots).map(root => Buffer.from(root.der, 'base64')),
  onlineChecks: true
}

const environmentOf: Record<AppStoreEnvironment, Environment> = {
  Production: Environment.PRODUCTION,
  Sandbox: Environment.SANDBOX,
  Xcode: Environment.XCODE
}

class NotOurs extends Error {}

function signedPayloadIn(body: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new NotOurs('not JSON')
  }
  const signedPayload = (parsed as { signedPayload?: unknown } | null)?.signedPayload
  if (typeof signedPayload !== 'string') throw new NotOurs('no signedPayload')
  return signedPayload
}

function claimedEnvironment(signed: string): string | undefined {
  try {
    const payload = decodeJwt(signed) as {
      environment?: string
      data?: { environment?: string }
      summary?: { environment?: string }
    }
    return payload.environment ?? payload.data?.environment ?? payload.summary?.environment
  } catch {
    return undefined
  }
}

async function verified<T>(work: () => Promise<T>): Promise<Verified<T>> {
  try {
    return await work()
  } catch (error) {
    if (
      error instanceof VerificationException &&
      error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
    ) {
      log('warn', "apple: couldn't check a certificate's revocation; asking Apple to retry")
      return 'retry'
    }
    if (!(error instanceof VerificationException) && !(error instanceof NotOurs)) throw error
    return 'invalid'
  }
}

export function appStoreBilling(
  config: AppStoreConfig,
  trust: AppStoreTrust = appleTrust
): StoreBilling {
  const verifiers = new Map(
    config.environments.map(environment => [
      environment as string,
      new SignedDataVerifier(
        [...trust.rootCertificates],
        trust.onlineChecks,
        environmentOf[environment],
        config.bundleId,
        config.appAppleId
      )
    ])
  )
  const clients =
    trust.apiClients ?? (config.apiKey ? appStoreApiClients(config.apiKey, config.bundleId) : null)
  const api = clients ? appStoreApi(clients) : null

  const verifierFor = (signed: string) => {
    const verifier = verifiers.get(claimedEnvironment(signed) ?? '')
    if (!verifier) throw new NotOurs('not an environment this service takes')
    return verifier
  }

  async function subscriptionTransaction(verifier: SignedDataVerifier, signed: string) {
    const transaction = await verifier.verifyAndDecodeTransaction(signed)
    if (!isSubscriptionTransaction(transaction)) throw new NotOurs('not a subscription')
    return transaction
  }

  async function storeState(
    verifier: SignedDataVerifier,
    signedTransactionInfo: string,
    signedRenewalInfo: string | undefined,
    reportedStatus: number | undefined,
    stateAt: (transaction: AppleTransaction) => Date
  ) {
    const transaction = await subscriptionTransaction(verifier, signedTransactionInfo)
    const renewal: JWSRenewalInfoDecodedPayload | null = signedRenewalInfo
      ? await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo)
      : null
    const state = appleState({
      transaction,
      renewal,
      reportedStatus,
      stateAt: stateAt(transaction),
      origin: 'provider'
    })
    return { transaction, state }
  }

  async function notificationEvent(
    verifier: SignedDataVerifier,
    notification: ResponseBodyV2DecodedPayload
  ): Promise<ProviderEvent> {
    const type = notification.notificationType ?? 'UNKNOWN'
    const event: ProviderEvent = {
      source: appStoreSource,
      id: notification.notificationUUID ?? '',
      type: notification.subtype ? `${type}.${notification.subtype}` : type,
      subscription: null,
      ledger: [],
      hints: {},
      startsSubscription: false
    }
    const data = notification.data
    if (type === NotificationTypeV2.TEST || !data?.signedTransactionInfo) return event
    const { transaction, state } = await storeState(
      verifier,
      data.signedTransactionInfo,
      data.signedRenewalInfo,
      data.status,
      () => new Date(notification.signedDate ?? Date.now())
    )
    return {
      ...event,
      subscription: { key: state.subscription, read: async () => state },
      ledger: appleLedger(transaction, type),
      hints: state.hints
    }
  }

  async function fromTheStore(
    verifier: SignedDataVerifier,
    transaction: AppleTransaction
  ): Promise<DeviceTransaction | null> {
    const environment = apiEnvironments[transaction.environment]
    if (!api || !environment) return null
    const latest = await api.latest(environment, transaction.originalTransactionId)
    if (!latest?.signedTransactionInfo) return null
    const { transaction: current, state } = await storeState(
      verifier,
      latest.signedTransactionInfo,
      latest.signedRenewalInfo,
      latest.status,
      each => new Date(each.signedDate ?? Date.now())
    )
    const token = transaction.appAccountToken
    return {
      state: { ...state, hints: token ? { appAccountToken: token } : state.hints },
      ledger: [...appleLedger(transaction, undefined), ...appleLedger(current, undefined)]
    }
  }

  return {
    source: appStoreSource,
    products: config.products,

    verifyNotification: body =>
      verified(async () => {
        const signedPayload = signedPayloadIn(body)
        const verifier = verifierFor(signedPayload)
        const notification = await verifier.verifyAndDecodeNotification(signedPayload)
        if (!notification.notificationUUID) throw new NotOurs('no notificationUUID')
        return notificationEvent(verifier, notification)
      }),

    verifyTransaction: signed =>
      verified(async () => {
        const verifier = verifierFor(signed)
        const transaction = await subscriptionTransaction(verifier, signed)
        return (
          (await fromTheStore(verifier, transaction)) ?? {
            state: appleState({
              transaction,
              renewal: null,
              reportedStatus: undefined,
              stateAt: new Date(transaction.signedDate ?? Date.now()),
              origin: 'device'
            }),
            ledger: appleLedger(transaction, undefined)
          }
        )
      }),

    async recentNotifications() {
      if (!api) return []
      const now = new Date()
      const bodies: string[] = []
      for (const name of config.environments) {
        const environment = apiEnvironments[name]
        if (!environment) continue
        for (const signedPayload of await api.recent(environment, now)) {
          bodies.push(JSON.stringify({ signedPayload }))
        }
      }
      return bodies
    }
  }
}
