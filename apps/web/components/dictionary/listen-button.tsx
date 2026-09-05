'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Volume2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const subscribe = () => () => {};
const supported = () =>
  'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function ListenButton({ reading }: { reading: string }) {
  const available = useSyncExternalStore(subscribe, supported, () => false);
  const [failed, setFailed] = useState(false);
  const t = useTranslations('Dictionary');
  return (
    <div>
      <Button
        variant="outline"
        disabled={!available}
        onClick={() => {
          setFailed(false);
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(reading);
          utterance.lang = 'ja-JP';
          utterance.onerror = (event) => {
            if (event.error !== 'canceled' && event.error !== 'interrupted')
              setFailed(true);
          };
          window.speechSynthesis.speak(utterance);
        }}
      >
        <Volume2Icon data-icon="inline-start" />
        {available ? t('listen') : t('audioUnavailable')}
      </Button>
      {failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t('audioFailed')}
        </p>
      ) : null}
    </div>
  );
}
