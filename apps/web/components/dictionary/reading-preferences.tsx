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

const ReadingContext = createContext<{
  romaji: boolean;
  furigana: boolean;
  setRomaji: (value: boolean) => void;
  setFurigana: (value: boolean) => void;
} | null>(null);

export function ReadingPreferences({
  children,
}: {
  children: React.ReactNode;
}) {
  const [romaji, setRomaji] = useState(true);
  const [furigana, setFurigana] = useState(true);
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
  const preferences = useContext(ReadingContext);
  if (!preferences)
    throw new Error('ReadingToggles requires ReadingPreferences');
  return (
    <FieldSet className="mt-5">
      <FieldLegend className="sr-only">Reading aids</FieldLegend>
      <FieldGroup className="flex-row gap-7">
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="romaji"
            aria-label="Romaji"
            checked={preferences.romaji}
            onCheckedChange={preferences.setRomaji}
          />
          <FieldLabel htmlFor="romaji">Romaji</FieldLabel>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="furigana"
            aria-label="Furigana"
            checked={preferences.furigana}
            onCheckedChange={preferences.setFurigana}
          />
          <FieldLabel htmlFor="furigana">Furigana</FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
