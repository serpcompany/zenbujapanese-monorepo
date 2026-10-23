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

function bitCount(mask: number): number {
  let count = 0
  for (let rest = mask >>> 0; rest !== 0; rest >>>= 1) count += rest & 1
  return count
}

export function compareProfiles(lhs: PriorityProfile, rhs: PriorityProfile): number {
  const categories = category(lhs) - category(rhs)
  if (categories !== 0) return categories
  if (lhs.newsFrequencyBand !== rhs.newsFrequencyBand) {
    return (lhs.newsFrequencyBand ?? 99) - (rhs.newsFrequencyBand ?? 99)
  }
  return bitCount(rhs.primaryMask) - bitCount(lhs.primaryMask)
}

const profilesEqual = (lhs: PriorityProfile, rhs: PriorityProfile) =>
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

const isLaterSense = (rank: EnglishRank) =>
  rank.lane === EvidenceLane.strongGloss && rank.senseOrder > 0

function compareHeadwordLengthThenFingerprint(lhs: Rank, rhs: Rank): number {
  const difference = lhs.headwordLength - rhs.headwordLength
  if (difference !== 0) return difference
  return compareStrings(lhs.semanticFingerprint, rhs.semanticFingerprint)
}

function compareEnglishPlacements(lhs: EnglishRank, rhs: EnglishRank): number {
  let difference = lhs.lane - rhs.lane
  if (difference === 0) difference = lhs.romajiSpecificityRank - rhs.romajiSpecificityRank
  if (difference === 0) difference = Number(isLaterSense(lhs)) - Number(isLaterSense(rhs))
  return difference
}

export function compareEnglishRanks(lhs: EnglishRank, rhs: EnglishRank): number {
  let difference = compareEnglishPlacements(lhs, rhs)
  if (difference === 0) difference = lhs.priorityPresenceRank - rhs.priorityPresenceRank
  if (difference === 0) difference = compareProfiles(lhs.priorityProfile, rhs.priorityProfile)
  if (difference === 0) difference = lhs.senseOrder - rhs.senseOrder
  if (difference === 0) difference = lhs.glossOrder - rhs.glossOrder
  if (difference === 0) difference = lhs.corroborationRank - rhs.corroborationRank
  if (difference === 0) difference = compareHeadwordLengthThenFingerprint(lhs, rhs)
  return difference
}

export function compareJapaneseRanks(lhs: JapaneseRank, rhs: JapaneseRank): number {
  let difference = lhs.relation - rhs.relation
  if (difference === 0) difference = compareProfiles(lhs.priorityProfile, rhs.priorityProfile)
  if (difference === 0) difference = lhs.senseBreadthRank - rhs.senseBreadthRank
  if (difference === 0) difference = compareHeadwordLengthThenFingerprint(lhs, rhs)
  return difference
}

export function comparePresentationRanks(lhs: Rank, rhs: Rank): number {
  if (lhs.kind === 'english' && rhs.kind === 'english') return compareEnglishPlacements(lhs, rhs)
  if (lhs.kind === 'japanese' && rhs.kind === 'japanese') return lhs.relation - rhs.relation
  return lhs.kind === 'english' ? -1 : 1
}

const caseName = (cases: Record<string, number>, value: number) =>
  Object.keys(cases).find(key => cases[key] === value) ?? String(value)

export function matchLabel(sourceOrder: number, rank: Rank): string {
  const match =
    rank.kind === 'japanese'
      ? `japanese ${caseName(FormRelation, rank.relation)}`
      : `english ${caseName(EvidenceLane, rank.lane)} romaji=${rank.romajiSpecificityRank}` +
        (rank.lane === EvidenceLane.strongGloss
          ? ` sense=${isLaterSense(rank) ? 'later' : 'first'}`
          : '')
  return `source=${sourceOrder} ${match}`
}

export function sameLexicalGroup(lhs: Rank, rhs: Rank): boolean {
  if (lhs.kind === 'english' && rhs.kind === 'english') {
    return (
      compareEnglishPlacements(lhs, rhs) === 0 &&
      lhs.priorityPresenceRank === rhs.priorityPresenceRank &&
      profilesEqual(lhs.priorityProfile, rhs.priorityProfile) &&
      lhs.senseOrder === rhs.senseOrder &&
      lhs.glossOrder === rhs.glossOrder &&
      lhs.corroborationRank === rhs.corroborationRank
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
