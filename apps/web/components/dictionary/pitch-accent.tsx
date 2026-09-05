import type { PitchAccent } from '@/lib/dictionary/types';

export function PitchAccentView({
  reading,
  pitch,
}: {
  reading: string;
  pitch: PitchAccent;
}) {
  const count = Math.max(pitch.moraCount, 1);
  const drop =
    pitch.downstep === 0 ? count : Math.min(Math.max(pitch.downstep, 1), count);
  const katakana = Array.from(reading, (character) => {
    const code = character.codePointAt(0)!;
    return code >= 0x3041 && code <= 0x3096
      ? String.fromCodePoint(code + 0x60)
      : character;
  }).join('');
  return (
    <span
      className="native-pitch"
      role="img"
      aria-label={`Pitch accent for ${reading}, downstep ${pitch.downstep}, ${pitch.moraCount} mora`}
      title={pitch.sourceIdentity}
    >
      <span lang="ja">
        {katakana}
        <svg viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden="true">
          <path
            d={`M 0 1 H ${(100 * drop) / count}${pitch.downstep > 0 ? ` L ${Math.min(100, (100 * drop) / count + 5)} 6 H 100` : ''}`}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>
    </span>
  );
}
