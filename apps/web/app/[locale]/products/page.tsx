import { ScaffoldPage, PreviewCard } from '@/components/site/scaffold';
export const metadata = { title: 'Products' };
export default function ProductsPage() {
  return (
    <ScaffoldPage
      title="Products"
      description="Product discovery, with separate overview, feature, and pricing pages."
    >
      <PreviewCard
        title="Zenbu Japanese"
        description="Preview of the product information structure; availability and commercial terms are pending."
        href="/products/zenbu-japanese"
      />
    </ScaffoldPage>
  );
}
