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

export function DictionarySearch({ query = '' }: { query?: string }) {
  return (
    <section className="dictionary-hero">
      <h1>Zenbu Dictionary</h1>
      <div className="mx-auto max-w-[620px]">
        <Form action="/dictionary" role="search">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="search" className="sr-only">
                Search dictionary
              </FieldLabel>
              <InputGroup className="h-14 px-2">
                <InputGroupInput
                  key={query}
                  id="search"
                  name="search"
                  type="search"
                  defaultValue={query}
                  placeholder="Japanese, romaji, or English"
                />
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                  <Button type="submit" size="icon-lg" aria-label="Search">
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
        </Form>
        <ReadingToggles />
      </div>
    </section>
  );
}
