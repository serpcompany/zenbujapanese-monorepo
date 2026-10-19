import { generateKeyPairSync, type KeyObject, randomUUID, X509Certificate } from 'node:crypto'
import { AppStoreServerAPIClient, type Environment } from '@apple/app-store-server-library'
import { CompactSign } from 'jose'
import { KJUR } from 'jsrsasign'
import { appSellingTheSubscription, clientById } from '../domain/clients'

const appBundleIdentifier = clientById(appSellingTheSubscription)?.appleBundleIds[0] ?? ''

const intermediateMarker = '1.2.840.113635.100.6.2.1'
const leafMarker = '1.2.840.113635.100.6.11.1'
const asn1Null = '0500'
export const appAppleId = 1_234_567_890
export const monthly = 'com.zenbujapanese.cloud.monthly'
export const yearly = 'com.zenbujapanese.cloud.yearly'
const dayMs = 24 * 60 * 60 * 1000

interface KeyPair {
  privateKey: KeyObject
  publicPem: string
  privatePem: string
}

function keyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    privateKey,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  }
}

let serials = 1

function issue(
  subject: string,
  subjectKey: KeyPair,
  issuer: string,
  issuerKey: KeyPair,
  marker?: string
) {
  const ca = marker !== leafMarker
  const certificate = new KJUR.asn1.x509.Certificate({
    version: 3,
    serial: { int: serials++ },
    issuer: { str: `/CN=${issuer}` },
    subject: { str: `/CN=${subject}` },
    notbefore: '200101000000Z',
    notafter: '400101000000Z',
    sbjpubkey: subjectKey.publicPem,
    ext: [
      { extname: 'basicConstraints', critical: true, cA: ca },
      ...(marker ? [{ extname: marker, extn: asn1Null }] : [])
    ],
    sigalg: 'SHA256withECDSA',
    cakey: subjectKey === issuerKey ? subjectKey.privatePem : issuerKey.privatePem
  } as ConstructorParameters<typeof KJUR.asn1.x509.Certificate>[0])
  return new X509Certificate(certificate.getPEM())
}

function chain(rootName: string) {
  const rootKey = keyPair()
  const intermediateKey = keyPair()
  const leafKey = keyPair()
  const root = issue(rootName, rootKey, rootName, rootKey)
  const intermediate = issue(
    'Stand-in WWDR',
    intermediateKey,
    rootName,
    rootKey,
    intermediateMarker
  )
  const leaf = issue('Stand-in App Store', leafKey, 'Stand-in WWDR', intermediateKey, leafMarker)
  return {
    root,
    signer: leafKey.privateKey,
    x5c: [leaf, intermediate, root].map(each => each.raw.toString('base64'))
  }
}

export interface TransactionFields {
  originalTransactionId: string
  transactionId?: string
  productId?: string
  purchaseDate?: number
  expiresDate?: number
  appAccountToken?: string
  revocationDate?: number
  revocationType?: string
  revocationPercentage?: number
  inAppOwnershipType?: string
  price?: number
  currency?: string
  environment?: string
  bundleId?: string
  type?: string
  signedDate?: number
}

export interface RenewalFields {
  environment?: string
  autoRenewStatus?: number
  isInBillingRetryPeriod?: boolean
  gracePeriodExpiresDate?: number
  signedDate?: number
}

export interface NotificationFields {
  type: string
  subtype?: string
  uuid?: string
  transaction?: TransactionFields
  renewal?: RenewalFields
  status?: number
  signedDate?: number
  environment?: string
}

let transactions = 1

export function standInAppStore() {
  const apple = chain('Stand-in Apple Root')
  const stranger = chain('Not Apple')
  const sign = async (payload: object, signedBy = apple) =>
    new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
      .setProtectedHeader({ alg: 'ES256', x5c: signedBy.x5c })
      .sign(signedBy.signer)

  const transaction = (fields: TransactionFields, signedBy = apple) => {
    const purchaseDate = fields.purchaseDate ?? Date.now()
    return sign(
      {
        transactionId: fields.transactionId ?? `${2_000_000_000 + transactions++}`,
        webOrderLineItemId: `${3_000_000_000 + transactions}`,
        bundleId: appBundleIdentifier,
        productId: monthly,
        subscriptionGroupIdentifier: '21000001',
        originalPurchaseDate: purchaseDate,
        expiresDate: purchaseDate + 30 * dayMs,
        quantity: 1,
        type: 'Auto-Renewable Subscription',
        inAppOwnershipType: 'PURCHASED',
        signedDate: Date.now(),
        environment: 'Sandbox',
        transactionReason: 'PURCHASE',
        storefront: 'USA',
        storefrontId: '143441',
        price: 4990,
        currency: 'USD',
        ...fields,
        purchaseDate
      },
      signedBy
    )
  }

  const renewal = (originalTransactionId: string, fields: RenewalFields = {}) =>
    sign({
      originalTransactionId,
      autoRenewProductId: monthly,
      productId: monthly,
      autoRenewStatus: 1,
      signedDate: Date.now(),
      environment: 'Sandbox',
      ...fields
    })

  const notification = async (fields: NotificationFields, signedBy = apple) => {
    const environment = fields.environment ?? 'Sandbox'
    const data = {
      appAppleId,
      bundleId: appBundleIdentifier,
      bundleVersion: '1.0',
      environment,
      ...(fields.transaction
        ? {
            signedTransactionInfo: await transaction({ environment, ...fields.transaction }),
            signedRenewalInfo: await renewal(fields.transaction.originalTransactionId, {
              environment,
              ...fields.renewal
            })
          }
        : {}),
      ...(fields.status === undefined ? {} : { status: fields.status })
    }
    const signedPayload = await sign(
      {
        notificationType: fields.type,
        ...(fields.subtype ? { subtype: fields.subtype } : {}),
        notificationUUID: fields.uuid ?? randomUUID(),
        data,
        version: '2.0',
        signedDate: fields.signedDate ?? Date.now()
      },
      signedBy
    )
    return JSON.stringify({ signedPayload })
  }

  const statuses = new Map<string, StoreStatus>()
  const history: string[] = []
  const apiKey = keyPair().privatePem
  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    }) as unknown as ReturnType<AppStoreServerAPIClient['getAllSubscriptionStatuses']>

  class StandInApi extends AppStoreServerAPIClient {
    constructor(environment: Environment) {
      super(apiKey, 'STANDINKEY', 'stand-in-issuer', appBundleIdentifier, environment)
    }

    protected override async makeFetchRequest(
      path: string,
      _query: URLSearchParams,
      method: string
    ) {
      const id = path.split('/').at(-1) ?? ''
      const known = method === 'GET' ? statuses.get(id) : undefined
      if (method === 'POST' && path === '/inApps/v1/notifications/history') {
        return answer({
          notificationHistory: history.map(signedPayload => ({ signedPayload })),
          hasMore: false
        }) as never
      }
      if (!known) return answer({ errorCode: 4040010, errorMessage: 'not found' }, 404) as never
      return answer({
        environment: 'Sandbox',
        bundleId: appBundleIdentifier,
        data: [
          {
            subscriptionGroupIdentifier: '21000001',
            lastTransactions: [
              {
                originalTransactionId: id,
                status: known.status,
                signedTransactionInfo: await transaction(known.transaction),
                signedRenewalInfo: await renewal(id, known.renewal)
              }
            ]
          }
        ]
      }) as never
    }
  }

  return {
    trust: { rootCertificates: [apple.root.raw], onlineChecks: false },
    stranger,
    transaction,
    notification,
    api: {
      statuses,
      history,
      clients: (environment: Environment) => new StandInApi(environment)
    }
  }
}

interface StoreStatus {
  status: number
  transaction: TransactionFields
  renewal?: RenewalFields
}

export type StandInAppStore = ReturnType<typeof standInAppStore>
