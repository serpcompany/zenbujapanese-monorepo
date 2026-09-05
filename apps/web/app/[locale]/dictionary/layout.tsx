import { cookies } from 'next/headers';
import { ReadingPreferences } from '@/components/dictionary/reading-preferences';

export const metadata = { title: 'Dictionary sample' };
export default async function DictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const preferences = await cookies();
  return (
    <ReadingPreferences
      initialRomaji={preferences.get('zenbu-romaji')?.value !== 'false'}
      initialFurigana={preferences.get('zenbu-furigana')?.value !== 'false'}
    >
      {children}
    </ReadingPreferences>
  );
}
