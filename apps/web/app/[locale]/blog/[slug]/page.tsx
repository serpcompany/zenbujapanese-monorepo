import { notFound } from 'next/navigation';
import {
  ScaffoldPage,
  ContentSections,
  PreviewLink,
} from '@/components/site/scaffold';
export const metadata = { title: 'Behind the dictionary — Article preview' };
export default async function BlogPost({
  params,
}: PageProps<'/[locale]/blog/[slug]'>) {
  if ((await params).slug !== 'behind-the-dictionary') notFound();
  return (
    <ScaffoldPage
      title="Behind the dictionary"
      description="An editorial article preview, not a published post."
    >
      <article>
        <p className="text-muted-foreground">
          Author and publication date pending.
        </p>
        <ContentSections
          items={[
            {
              title: 'Article introduction',
              body: 'The introduction will establish the topic and the intended reader. No final article has been written.',
            },
            {
              title: 'Main article',
              body: 'Approved editorial copy, evidence, and illustrations belong here.',
            },
            {
              title: 'Sources and further reading',
              body: 'References must support the final article and preserve attribution.',
            },
          ]}
        />
      </article>
      <PreviewLink href="/blog">Back to blog →</PreviewLink>
    </ScaffoldPage>
  );
}
