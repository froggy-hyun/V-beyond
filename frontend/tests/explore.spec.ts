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

test('종목 차트 아래 건강 이슈 비교와 대안 종목 이동', async ({ page }) => {
  await page.goto('/stocks/KR:KOSPI:004370')
  const chart = page.getByRole('img', { name: '시세 및 거래량 차트' })
  const comparison = page.getByRole('region', { name: '판매 상품 건강 이슈 비교' })
  await expect(chart).toBeVisible()
  await expect(comparison).toBeVisible()
  expect((await comparison.boundingBox())!.y).toBeGreaterThan((await chart.boundingBox())!.y)
  const red = comparison.getByRole('article', { name: '신라면 더레드 건강 이슈 비교' })
  await expect(red.getByText('2,080 mg')).toBeVisible()
  await expect(red.getByText('1,560 mg')).toBeVisible()
  await expect(red.getByText('25% 낮음')).toBeVisible()
  await expect(red.getByRole('link', { name: '기관 근거' })).toHaveAttribute('href', /who\.int/)
  const light = comparison.getByRole('article', { name: '신라면 건면 건강 이슈 비교' })
  await expect(light.getByText('자료 없음', { exact: true })).toBeVisible()
  await expect(light.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(0)

  const tabs = page.getByRole('group', { name: '종목 상세 탭' })
  await tabs.getByRole('button', { name: '판매상품' }).click()
  await expect(page.getByRole('heading', { name: '판매 상품', exact: true })).toBeVisible()
  await expect(comparison).toHaveCount(0)
  await tabs.getByRole('button', { name: '차트', exact: true }).click()
  await red.getByRole('link', { name: '풀무원 종목 바로가기' }).click()
  await expect(page.getByRole('heading', { name: '풀무원', exact: true })).toBeVisible()
  await expect(chart).toBeVisible()
})

test('종목 비교에서 소재와 성분 기준별 검증 결과 표시', async ({ request, page }) => {
  const soup = await request.get('/api/v1/stocks/US:NASDAQ:CPB/health-comparisons')
  expect(soup.ok()).toBe(true)
  expect(await soup.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ product: expect.objectContaining({ id: 'campbell-original' }), issues: [
      expect.objectContaining({ baseline: expect.objectContaining({ value: 890 }), alternative: expect.objectContaining({
        stock: expect.objectContaining({ symbol: 'GIS' }), fact: expect.objectContaining({ value: 460 }),
      }) }),
    ] }),
  ]))
  await page.goto('/stocks/US:NASDAQ:NWL')
  const pan = page.getByRole('article', { name: /Premier.*건강 이슈 비교/ })
  await expect(pan.getByText('사용 확인', { exact: true })).toBeVisible()
  await expect(pan.getByText('미사용 확인', { exact: true })).toBeVisible()
  await expect(pan.getByRole('link', { name: '윌리엄스 소노마 종목 바로가기' })).toBeVisible()

  await page.goto('/stocks/US:NYSE:KO')
  const cola = page.getByRole('article', { name: '코카콜라 오리지널 건강 이슈 비교' })
  await expect(cola.getByText('10.99 g')).toBeVisible()
  await expect(cola.getByText('아스파탐 사용 확인')).toBeVisible()
  await cola.getByRole('button', { name: '아스파탐', exact: true }).click()
  await expect(cola.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(0)
  await expect(cola.getByText(/같은 기준에서/)).toBeVisible()

  const nuggets = await request.get('/api/v1/stocks/US:NYSE:CAG/health-comparisons')
  expect(nuggets.ok()).toBe(true)
  expect(await nuggets.json()).toEqual([expect.objectContaining({ issues: [expect.objectContaining({
    baseline: expect.objectContaining({ criterion: 'SODIUM', basis: 'PER_100G' }),
    alternative: expect.objectContaining({ stock: expect.objectContaining({ symbol: 'TSN' }), fact: expect.objectContaining({ basis: 'PER_100G' }) }),
  })] })])
})

test('검색, 관심종목 및 자연어 조건 수정', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '주식', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '검색', exact: true }).click()
  await page.getByRole('textbox', { name: '기업·상품 검색' }).fill('004370')
  await page.getByRole('link', { name: /농심/ }).click()
  await page.getByRole('button', { name: '관심종목' }).click()
  await page.getByRole('navigation').getByRole('link', { name: '관심', exact: true }).click()
  await expect(page.getByRole('heading', { name: '관심종목' })).toBeVisible()
  await expect(page.locator('.stock-row').filter({ hasText: '농심' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: '메뉴' }).click()
  await page.getByRole('link', { name: 'AI 상품 탐색', exact: true }).click()
  await page.getByRole('button', { name: '나트륨이 낮은 라면' }).click()
  await expect(page.getByRole('heading', { name: '탐색 결과' })).toBeVisible()
  await expect(page.getByLabel('비교 기준')).toHaveValue('SODIUM')
  await page.getByLabel('비교 기준').selectOption('CALORIES')
  await expect(page.getByRole('heading', { name: '탐색 결과' })).toBeVisible()
})
