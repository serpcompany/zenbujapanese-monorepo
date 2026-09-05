import { ProductPage } from '@/components/site/product';
export const metadata = { title: 'Zenbu Japanese — Product preview' };
export default async function Page({
  params,
}: PageProps<'/[locale]/products/[product]'>) {
  return <ProductPage product={(await params).product} />;
}
