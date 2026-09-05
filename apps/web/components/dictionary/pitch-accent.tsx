import type { PitchAccent } from '@/lib/dictionary/types';
import { Badge } from '@/components/ui/badge';

export function PitchAccentView({
  reading,
  pitch,
}: {
  reading: string;
  pitch: PitchAccent;
}) {
  return (
    <Badge
      variant="outline"
      aria-label={`Pitch accent for ${reading}, downstep ${pitch.downstep}, ${pitch.moraCount} mora`}
      title={pitch.sourceIdentity}
    >
      Pitch {pitch.downstep}
    </Badge>
  );
}
