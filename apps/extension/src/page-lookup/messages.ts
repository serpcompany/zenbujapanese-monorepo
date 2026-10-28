export type StopPageLookup = { target: 'page-lookup'; stop: true }

export type ReadPageSelection = { target: 'page-lookup'; selection: 'read' }

export type PageSelection = { selection: string }

export const stopPageLookup: StopPageLookup = { target: 'page-lookup', stop: true }

export const readPageSelection: ReadPageSelection = { target: 'page-lookup', selection: 'read' }

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null

export const isStopPageLookup = (message: unknown): message is StopPageLookup =>
  isFields(message) && message.target === 'page-lookup' && message.stop === true

export const isReadPageSelection = (message: unknown): message is ReadPageSelection =>
  isFields(message) && message.target === 'page-lookup' && message.selection === 'read'

export const isPageSelection = (answer: unknown): answer is PageSelection =>
  isFields(answer) && typeof answer.selection === 'string'
