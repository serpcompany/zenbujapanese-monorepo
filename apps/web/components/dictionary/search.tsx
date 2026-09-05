import Form from 'next/form';
import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ReadingToggles } from './reading-preferences';
import { getLocale, getTranslations } from 'next-intl/server';
import { getPathname } from '@/i18n/navigation';

export async function DictionarySearch({ query = '' }: { query?: string }) {
  const locale = await getLocale();
  const t = await getTranslations('Dictionary');
  return (
    <section className="px-6 py-12 text-center md:py-16">
      <h1 className="mb-8 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Zenbu Dictionary</h1>
      <div className="mx-auto max-w-[620px]">
        <Form
          action={getPathname({ locale, href: '/dictionary' })}
          role="search"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="search" className="sr-only">
                {t('searchLabel')}
              </FieldLabel>
              <InputGroup className="h-14 px-2">
                <InputGroupInput
                  key={query}
                  id="search"
                  name="search"
                  type="search"
                  defaultValue={query}
                  placeholder={t('placeholder')}
                />
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                  <Button type="submit" size="icon-lg" aria-label={t('search')}>
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
        </Form>
        <ReadingToggles />
        {locale === 'ja' ? (
          <p className="mt-5 text-sm leading-6 text-muted-foreground">{t('glossNotice')}</p>
        ) : null}
      </div>
    </section>
  );
}
