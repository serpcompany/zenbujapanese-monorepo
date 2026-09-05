import { notFound } from 'next/navigation';
import {
  ScaffoldPage,
  ContentSections,
  PreviewLink,
} from '@/components/site/scaffold';
export const metadata = { title: 'Dictionary guide — Resource preview' };
export default async function ResourcePage({
  params,
}: PageProps<'/[locale]/resources/[slug]'>) {
  if ((await params).slug !== 'dictionary-guide') notFound();
  return (
    <ScaffoldPage
      title="Dictionary guide"
      description="A reference resource for looking up how dictionary entries are organized."
    >
      <ContentSections
        items={[
          {
            title: 'When to use this guide',
            body: 'This resource is intended as a reference while using the dictionary. Its explanatory content is pending.',
          },
          {
            title: 'Reference sections',
            body: 'Approved sections will explain source-backed readings, meanings, and optional evidence without inventing dictionary facts.',
          },
          {
            title: 'Downloads and external sources',
            body: 'No download, external resource endorsement, or licensed material has been approved yet.',
          },
        ]}
      />
      <PreviewLink href="/resources">Back to resources →</PreviewLink>
    </ScaffoldPage>
  );
}
