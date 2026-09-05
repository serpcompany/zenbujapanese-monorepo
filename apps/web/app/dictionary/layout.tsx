import { ReadingPreferences } from '@/components/dictionary/reading-preferences';

export default function DictionaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReadingPreferences>{children}</ReadingPreferences>;
}
