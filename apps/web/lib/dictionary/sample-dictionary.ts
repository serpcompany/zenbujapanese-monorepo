import samples from './samples.json';
import type {
  DictionaryEntry,
  ExampleSentence,
  FrequencyEvidence,
} from './types';

// A finite sample presentation envelope. Romaji comes from the app's forms table;
// it is not a new field on DictionaryEntry or a web transliteration algorithm.
export interface DictionarySample {
  readonly entry: DictionaryEntry;
  readonly romaji: readonly string[];
  readonly frequency: FrequencyEvidence | null;
}

// JSON loses string literal unions on import. The bounded extraction is verified
// against the pinned iOS artifacts described in SAMPLE-PROVENANCE.md.
const dictionarySamples = samples as readonly DictionarySample[];

export function searchSamples(query: string): readonly DictionarySample[] {
  const normalized = query.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return dictionarySamples;
  return dictionarySamples.filter(({ entry, romaji }) =>
    [
      ...entry.writtenForms.map((form) => form.value),
      ...entry.readingForms.map((form) => form.value),
      ...romaji,
      ...entry.senses.map((sense) => sense.meaning),
    ].some((text) => text.toLowerCase().includes(normalized)),
  );
}

export function entrySlug(entry: DictionaryEntry): string {
  const source = entry.sourceProvenances.find(
    (item) => item.sourceIdentity === 'edrdg.jmdict',
  );
  if (!source)
    throw new Error('Sample route requires retained JMdict provenance');
  return `${entry.headword}-${source.sourceRecordID}`;
}

export function resolveSample(slug: string): DictionarySample | undefined {
  // Next 16.3 supplies encoded dynamic segments; also accept a decoded segment.
  try {
    const decoded = decodeURIComponent(slug);
    return dictionarySamples.find(({ entry }) => entrySlug(entry) === decoded);
  } catch {
    return undefined;
  }
}

export const eatingExample: ExampleSentence = {
  id: { rawValue: 'esp1_101c1072091d90ca232c113d205029ee' },
  japanese: '食べる？',
  english: 'Do you want to eat?',
};
