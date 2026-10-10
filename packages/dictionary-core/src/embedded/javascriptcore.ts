import { EmbeddedDictionary, type EmbeddedHost, embeddedEndpoint } from './dictionary'

declare const zenbuHost: EmbeddedHost

Object.assign(globalThis, { zenbuDictionary: embeddedEndpoint(new EmbeddedDictionary(zenbuHost)) })
