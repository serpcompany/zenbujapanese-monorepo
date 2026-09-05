import { ProductPage } from '@/components/site/product';
export const metadata = { title: 'Zenbu Japanese — Features preview' };
export default async function Page({
  params,
}: PageProps<'/[locale]/products/[product]/features'>) {
  return <ProductPage product={(await params).product} surface="features" />;
}
