import { expect, test } from '@playwright/test'

const scenarios = [
  { product: 'shin-red', competitor: '오뚜기', alternative: '진라면' },
  { product: 'calphalon-premier', competitor: '윌리엄스 소노마', alternative: 'Made In' },
  { product: 'campbell-original', competitor: '제너럴 밀스', alternative: 'Progresso' },
  { product: 'coke-original', competitor: '펩시코', alternative: '펩시 제로 슈거' },
]

for (const scenario of scenarios) {
  test(scenario.product + ' 근거부터 대안 기업 차트까지', async ({ page }) => {
    await page.goto('/products/' + scenario.product)
    await expect(page.getByRole('heading', { name: '건강 관련 근거' })).toBeVisible()
    await expect.poll(() => page.getByRole('img', { name: /제품 사진$/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByRole('link', { name: '사진 출처' })).toHaveAttribute('href', /^https:\/\//)
    await expect(page.locator('.evidence .source').first()).toBeVisible()
    await page.getByRole('link', { name: '대안 상품 탐색' }).click()
    await expect(page.getByText(scenario.alternative, { exact: false }).first()).toBeVisible()
    await page.locator('.match .stock-row').filter({ hasText: scenario.competitor }).first().click()
    await expect(page.getByRole('heading', { name: scenario.competitor })).toBeVisible()
    await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
  })
}

test('검색, 관심종목 및 자연어 조건 수정', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '오늘의 주식시장' })).toBeVisible()
  await page.getByRole('link', { name: '검색', exact: true }).click()
  await page.getByRole('textbox', { name: '기업·상품 검색' }).fill('004370')
  await page.getByRole('link', { name: /농심/ }).click()
  await page.getByRole('button', { name: '관심종목' }).click()
  await page.getByRole('navigation').getByRole('link', { name: '관심종목' }).click()
  await expect(page.getByRole('heading', { name: '관심종목' })).toBeVisible()
  await expect(page.locator('.stock-row').filter({ hasText: '농심' })).toBeVisible()
  await page.getByRole('link', { name: 'AI 탐색', exact: true }).click()
  await page.getByRole('button', { name: '나트륨이 낮은 라면' }).click()
  await expect(page.getByRole('heading', { name: '탐색 결과' })).toBeVisible()
  await expect(page.getByLabel('비교 기준')).toHaveValue('SODIUM')
  await page.getByLabel('비교 기준').selectOption('CALORIES')
  await expect(page.getByRole('heading', { name: '탐색 결과' })).toBeVisible()
})
