import { ScaffoldPage, PreviewCard } from '@/components/site/scaffold';
import { legalPages } from '@/lib/site/routes';
export const metadata = { title: 'Legal' };
export default function LegalIndex() {
  return (
    <ScaffoldPage
      title="Legal information"
      description="A directory of policy documents. None of these preview documents are operative legal terms."
    >
      <div className="preview-grid">
        {Object.entries(legalPages).map(([slug, item]) => (
          <PreviewCard
            key={slug}
            title={item.title}
            description="Awaiting owner and legal review; no final policy text."
            href={`/legal/${slug}`}
          />
        ))}
      </div>
    </ScaffoldPage>
  );
}
