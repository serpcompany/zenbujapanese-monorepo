'use client';

import { createContext, useContext, useState } from 'react';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useTranslations } from 'next-intl';

const ReadingContext = createContext<{
  romaji: boolean;
  furigana: boolean;
  setRomaji: (value: boolean) => void;
  setFurigana: (value: boolean) => void;
} | null>(null);

export function ReadingPreferences({
  children,
  initialRomaji = true,
  initialFurigana = true,
}: {
  children: React.ReactNode;
  initialRomaji?: boolean;
  initialFurigana?: boolean;
}) {
  const [romaji, updateRomaji] = useState(initialRomaji);
  const [furigana, updateFurigana] = useState(initialFurigana);
  function setRomaji(value: boolean) {
    updateRomaji(value);
    document.cookie = `zenbu-romaji=${value}; Path=/; SameSite=Lax`;
  }
  function setFurigana(value: boolean) {
    updateFurigana(value);
    document.cookie = `zenbu-furigana=${value}; Path=/; SameSite=Lax`;
  }
  return (
    <ReadingContext.Provider
      value={{ romaji, furigana, setRomaji, setFurigana }}
    >
      <div data-romaji={romaji} data-furigana={furigana}>
        {children}
      </div>
    </ReadingContext.Provider>
  );
}

export function ReadingToggles() {
  const t = useTranslations('Dictionary');
  const preferences = useContext(ReadingContext);
  if (!preferences)
    throw new Error('ReadingToggles requires ReadingPreferences');
  return (
    <FieldSet className="mt-5">
      <FieldLegend className="sr-only">{t('readingAids')}</FieldLegend>
      <FieldGroup className="flex-row gap-7">
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="romaji"
            aria-label={t('romaji')}
            checked={preferences.romaji}
            onCheckedChange={preferences.setRomaji}
          />
          <FieldLabel htmlFor="romaji">{t('romaji')}</FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="furigana"
            aria-label={t('furigana')}
            checked={preferences.furigana}
            onCheckedChange={preferences.setFurigana}
          />
          <FieldLabel htmlFor="furigana">{t('furigana')}</FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
