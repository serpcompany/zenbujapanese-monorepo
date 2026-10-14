import type { ArtifactDatabase } from './database'

export interface TatoebaContributor {
  username: string
  sentenceSideCount: number
}

export function tatoebaContributors(db: ArtifactDatabase): TatoebaContributor[] {
  return db.all<TatoebaContributor>(
    `SELECT username, sentence_side_count AS sentenceSideCount
     FROM example_sentence_contributors ORDER BY username COLLATE NOCASE`
  )
}
