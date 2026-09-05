import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPage, PreviewLink, ContentSections } from './scaffold';

export const sampleProduct = 'zenbu-japanese';
export async function ProductPage({
  product,
  surface = 'overview',
}: {
  product: string;
  surface?: 'overview' | 'features' | 'pricing';
}) {
  if (product !== sampleProduct) notFound();
  const t = await getTranslations('Shell');
  const titles = {
    overview: 'Zenbu Japanese',
    features: 'Zenbu Japanese — Features',
    pricing: 'Zenbu Japanese — Pricing',
  };
  const content = {
    overview: [
      {
        title: 'Product overview',
        body: 'This area will introduce the product and its intended learning experience. Approved product copy and screenshots are pending.',
      },
      {
        title: 'Availability',
        body: 'Platform availability and installation links must be confirmed before publication. No purchase or download is offered here.',
      },
    ],
    features: [
      {
        title: 'Feature overview',
        body: 'This page will explain verified product capabilities with approved descriptions and screenshots.',
      },
      {
        title: 'Dictionary experience',
        body: 'The connected sample dictionary can be reviewed separately. This section does not promise unimplemented product features.',
      },
    ],
    pricing: [
      {
        title: 'Pricing not announced',
        body: 'No prices, plans, trial terms, or purchase links have been approved for this page.',
      },
      {
        title: 'Plan comparison',
        body: 'This area is reserved for confirmed plan differences and billing terms. The preview makes no offer or payment request.',
      },
    ],
  };
  return (
    <ScaffoldPage
      title={titles[surface]}
      description="Product information and related feature and pricing surfaces."
    >
      <div className="product-links">
        <PreviewLink href={`/products/${product}`}>{t('overview')}</PreviewLink>
        <PreviewLink href={`/products/${product}/features`}>
          {t('features')}
        </PreviewLink>
        <PreviewLink href={`/products/${product}/pricing`}>
          {t('pricing')}
        </PreviewLink>
      </div>
      <ContentSections items={content[surface]} />
    </ScaffoldPage>
  );
}
