import { notFound } from 'next/navigation';
import { ScaffoldPage, PreviewLink } from '@/components/site/scaffold';
export const metadata = { title: 'First words — Lesson preview' };
export default async function LessonPage({
  params,
}: PageProps<'/[locale]/learn/[slug]'>) {
  if ((await params).slug !== 'first-words') notFound();
  return (
    <ScaffoldPage
      title="First words"
      description="A structured lesson outline with a learning objective and practice, distinct from a blog article."
    >
      <article>
        <h2>Lesson outline</h2>
        <ol className="outline-list">
          <li>
            <h3>Learning objective</h3>
            <p>
              The objective and prerequisites require an approved lesson plan.
            </p>
          </li>
          <li>
            <h3>Explanation</h3>
            <p>
              The authored lesson, source-backed vocabulary, and examples have
              not been supplied.
            </p>
          </li>
          <li>
            <h3>Practice</h3>
            <p>
              Exercises and feedback are not available. No progress, score, or
              completion state is recorded.
            </p>
          </li>
        </ol>
      </article>
      <PreviewLink href="/learn">Back to learning →</PreviewLink>
    </ScaffoldPage>
  );
}
