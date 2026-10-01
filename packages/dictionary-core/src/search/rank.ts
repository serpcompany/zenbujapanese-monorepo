import { compareStrings } from './query'

export interface PriorityProfile {
  primaryMask: number
  secondaryMask: number
  newsFrequencyBand: number | null
}

const special = 1
const learner = 2
const news = 4
const loanword = 8

export const isMarked = (profile: PriorityProfile) =>
  profile.primaryMask !== 0 || profile.secondaryMask !== 0 || profile.newsFrequencyBand !== null

function category({ primaryMask, secondaryMask }: PriorityProfile): number {
  if (primaryMask & special) return 0
  if (primaryMask & learner) return 1
  if (primaryMask & news) return 2
  if (primaryMask & loanword || secondaryMask & special) return 3
  if (secondaryMask & (learner | news)) return 4
  if (secondaryMask & loanword) return 5
  return 9
}

const bitCount = (value: number) => value.toString(2).replaceAll('0', '').length

export function compareProfiles(lhs: PriorityProfile, rhs: PriorityProfile): number {
  const categories = category(lhs) - category(rhs)
  if (categories !== 0) return categories
  if (lhs.newsFrequencyBand !== rhs.newsFrequencyBand) {
    return (lhs.newsFrequencyBand ?? 99) - (rhs.newsFrequencyBand ?? 99)
  }
  return bitCount(rhs.primaryMask) - bitCount(lhs.primaryMask)
}

export const profilesEqual = (lhs: PriorityProfile, rhs: PriorityProfile) =>
  lhs.primaryMask === rhs.primaryMask &&
  lhs.secondaryMask === rhs.secondaryMask &&
  lhs.newsFrequencyBand === rhs.newsFrequencyBand

export const EvidenceLane = { strongGloss: 0, tokenGloss: 1, romajiOnly: 2 } as const
export const GlossRelation = {
  exactGloss: 0,
  qualifiedGloss: 1,
  exactInfinitive: 2,
  qualifiedInfinitive: 3,
  glossToken: 4
} as const
export const RomajiRelation = { exact: 0, prefix: 1, contains: 2 } as const
export const FormRelation = {
  writtenExact: 0,
  readingExact: 1,
  writtenPrefix: 2,
  readingPrefix: 3,
  writtenContains: 4,
  readingContains: 5
} as const

export interface EnglishRank {
  kind: 'english'
  lane: number
  corroborationRank: number
  romajiSpecificityRank: number
  senseOrder: number
  priorityPresenceRank: number
  relation: number
  priorityProfile: PriorityProfile
  glossOrder: number
  headwordLength: number
  semanticFingerprint: string
}

export interface JapaneseRank {
  kind: 'japanese'
  relation: number
  priorityProfile: PriorityProfile
  senseBreadthRank: number
  headwordLength: number
  semanticFingerprint: string
}

export type Rank = EnglishRank | JapaneseRank

function firstDifference(...differences: (() => number)[]): number {
  for (const difference of differences) {
    const value = difference()
    if (value !== 0) return value
  }
  return 0
}

export function compareEnglishRanks(lhs: EnglishRank, rhs: EnglishRank): number {
  return firstDifference(
    () => lhs.lane - rhs.lane,
    () => lhs.corroborationRank - rhs.corroborationRank,
    () => lhs.romajiSpecificityRank - rhs.romajiSpecificityRank,
    () => lhs.senseOrder - rhs.senseOrder,
    () => lhs.priorityPresenceRank - rhs.priorityPresenceRank,
    () => lhs.relation - rhs.relation,
    () => compareProfiles(lhs.priorityProfile, rhs.priorityProfile),
    () => lhs.glossOrder - rhs.glossOrder,
    () => lhs.headwordLength - rhs.headwordLength,
    () => compareStrings(lhs.semanticFingerprint, rhs.semanticFingerprint)
  )
}

export function compareJapaneseRanks(lhs: JapaneseRank, rhs: JapaneseRank): number {
  return firstDifference(
    () => lhs.relation - rhs.relation,
    () => compareProfiles(lhs.priorityProfile, rhs.priorityProfile),
    () => lhs.senseBreadthRank - rhs.senseBreadthRank,
    () => lhs.headwordLength - rhs.headwordLength,
    () => compareStrings(lhs.semanticFingerprint, rhs.semanticFingerprint)
  )
}

export function comparePresentationRanks(lhs: Rank, rhs: Rank): number {
  if (lhs.kind === 'english' && rhs.kind === 'english') {
    return firstDifference(
      () => lhs.lane - rhs.lane,
      () => lhs.corroborationRank - rhs.corroborationRank,
      () => lhs.romajiSpecificityRank - rhs.romajiSpecificityRank,
      () => lhs.senseOrder - rhs.senseOrder,
      () => lhs.relation - rhs.relation
    )
  }
  if (lhs.kind === 'japanese' && rhs.kind === 'japanese') return lhs.relation - rhs.relation
  return lhs.kind === 'english' ? -1 : 1
}

export function sameLexicalGroup(lhs: Rank, rhs: Rank): boolean {
  if (lhs.kind === 'english' && rhs.kind === 'english') {
    return (
      lhs.lane === rhs.lane &&
      lhs.corroborationRank === rhs.corroborationRank &&
      lhs.romajiSpecificityRank === rhs.romajiSpecificityRank &&
      lhs.senseOrder === rhs.senseOrder &&
      lhs.priorityPresenceRank === rhs.priorityPresenceRank &&
      lhs.relation === rhs.relation &&
      profilesEqual(lhs.priorityProfile, rhs.priorityProfile) &&
      lhs.glossOrder === rhs.glossOrder
    )
  }
  if (lhs.kind === 'japanese' && rhs.kind === 'japanese') {
    return (
      lhs.relation === rhs.relation &&
      profilesEqual(lhs.priorityProfile, rhs.priorityProfile) &&
      lhs.senseBreadthRank === rhs.senseBreadthRank
    )
  }
  return false
}
