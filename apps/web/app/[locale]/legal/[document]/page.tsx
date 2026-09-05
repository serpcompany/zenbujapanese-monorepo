import { notFound } from 'next/navigation';
import { ScaffoldPage } from '@/components/site/scaffold';
import { legalPages } from '@/lib/site/routes';

function legalDocument(document: string) {
  if (!Object.hasOwn(legalPages, document)) notFound();
  return legalPages[document as keyof typeof legalPages];
}
export async function generateMetadata({
  params,
}: PageProps<'/[locale]/legal/[document]'>) {
  return { title: legalDocument((await params).document).title };
}
export default async function LegalDocument({
  params,
}: PageProps<'/[locale]/legal/[document]'>) {
  const item = legalDocument((await params).document);
  return (
    <ScaffoldPage
      title={item.title}
      description="Document structure only. This is not a published policy, legal notice, or advice."
    >
      <article className="typeset max-w-3xl">
        <h2>Pending policy decisions</h2>
        <ul>
          {item.topics.map((topic) => (
            <li key={topic}>
              {topic}
              <p>
                Approved wording is pending.
              </p>
            </li>
          ))}
        </ul>
        <p>No effective date or legal contact is claimed.</p>
      </article>
    </ScaffoldPage>
  );
}
