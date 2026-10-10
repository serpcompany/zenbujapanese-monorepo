import { embeddedEndpoint } from './dictionary'
import type { EmbeddedHost } from './host'

declare const zenbuHost: EmbeddedHost

Object.assign(globalThis, { zenbuDictionary: embeddedEndpoint(zenbuHost) })
