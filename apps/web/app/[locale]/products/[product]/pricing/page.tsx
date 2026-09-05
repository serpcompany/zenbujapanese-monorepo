import { ProductPage } from '@/components/site/product';
export const metadata = { title: 'Zenbu Japanese — Pricing preview' };
export default async function Page({
  params,
}: PageProps<'/[locale]/products/[product]/pricing'>) {
  return <ProductPage product={(await params).product} surface="pricing" />;
}
