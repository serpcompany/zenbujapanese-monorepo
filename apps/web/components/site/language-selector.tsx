'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

export function LanguageSelector({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <NativeSelect
        aria-label={label}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const nextLocale = event.target.value;
          const query = window.location.search;
          const hash = window.location.hash;
          startTransition(() =>
            router.replace(`${pathname}${query}${hash}`, {
              locale: nextLocale,
              scroll: false,
            }),
          );
        }}
      >
        <NativeSelectOption value="en">English</NativeSelectOption>
        <NativeSelectOption value="ja">日本語</NativeSelectOption>
      </NativeSelect>
    </label>
  );
}
