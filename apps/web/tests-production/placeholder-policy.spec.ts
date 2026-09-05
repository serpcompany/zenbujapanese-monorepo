import {test,expect} from '@playwright/test';

test('production build keeps scaffold navigation hidden and pages noindex',async({page})=>{
  for(const prefix of ['', '/ja']) {
    await page.goto(`${prefix}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
    for(const path of ['/sitemap','/about','/products','/blog','/legal']) {
      await expect(page.locator(`a[href="${prefix}${path}"]`)).toHaveCount(0);
    }
    const response=await page.goto(`${prefix}/sitemap`);
    expect(response?.status()).toBe(404);
    await page.goto(`${prefix}/products/zenbu-japanese/pricing`);
    await expect(page.getByRole('heading',{name:'Pricing not announced'})).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
    await expect(page.locator(`a[href="${prefix}/products/zenbu-japanese/features"]`)).toHaveCount(0);
  }
});
