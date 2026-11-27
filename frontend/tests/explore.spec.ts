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
  await expect(red.getByText('WINNER', { exact: true })).toBeVisible()
  await expect(red.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(3)
  await expect(red.getByText(/심혈관질환/)).toBeVisible()
  await expect(red.getByRole('link', { name: '기관 근거' })).toHaveAttribute('href', /who\.int/)
  const light = comparison.getByRole('article', { name: '신라면 건면 건강 이슈 비교' })
  await expect(light.getByText('1,790 mg', { exact: true })).toBeVisible()
  await expect(light.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(3)
  const pageWidth = (await page.locator('.stock-page').boundingBox())!.width
  expect((await comparison.boundingBox())!.width).toBeCloseTo(pageWidth, 0)

  const tabs = page.getByRole('group', { name: '종목 상세 탭' })
  await tabs.getByRole('button', { name: '판매상품' }).click()
  await expect(page.getByRole('heading', { name: '판매 상품', exact: true })).toBeVisible()
  await expect(comparison).toHaveCount(0)
  await tabs.getByRole('button', { name: '차트', exact: true }).click()
  await red.getByRole('link', { name: '풀무원 종목 바로가기' }).first().click()
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
  await expect(pan.getByText('미사용 확인', { exact: true }).first()).toBeVisible()
  await expect(pan.getByRole('link', { name: '윌리엄스 소노마 종목 바로가기' })).toBeVisible()

  await page.goto('/stocks/US:NYSE:KO')
  const cola = page.getByRole('article', { name: '코카콜라 오리지널 건강 이슈 비교' })
  await expect(cola.getByText('10.99 g')).toBeVisible()
  await expect(cola.getByText('아스파탐 사용 확인').first()).toBeVisible()
  await cola.getByRole('button', { name: '아스파탐', exact: true }).click()
  await expect(cola.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(3)
  await expect(cola.getByText(/IARC.*JECFA/)).toBeVisible()

  const nuggets = await request.get('/api/v1/stocks/US:NYSE:CAG/health-comparisons')
  expect(nuggets.ok()).toBe(true)
  expect(await nuggets.json()).toEqual(expect.arrayContaining([expect.objectContaining({ product: expect.objectContaining({ id: 'banquet-original-nuggets' }), issues: [expect.objectContaining({
    baseline: expect.objectContaining({ criterion: 'SODIUM', basis: 'PER_100G' }),
    alternative: expect.objectContaining({ stock: expect.objectContaining({ symbol: 'TSN' }), fact: expect.objectContaining({ basis: 'PER_100G' }) }),
  })] })]))
})

test('브랜드 판매액과 분기 점유율, 공시 매출 및 AI 상품 소개', async ({ page }) => {
  await page.route('**/api/v1/stocks/*/product-overview', route => route.fulfill({ json: {
    status: 'AI', text: '농심은 신라면과 신라면 건면을 제조하고 누들핏 컵면을 유통합니다.',
  } }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/stocks/KR:KOSPI:004370')
  const performance = page.getByRole('region', { name: '상품 매출 · 시장점유율' })
  const retail = performance.getByRole('article', { name: '국내 라면 소매시장' })
  await expect(retail.getByRole('heading', { name: '2026년 1분기 판매액 점유율' })).toBeVisible({ timeout: 12_000 })
  await expect(retail.locator('.performance-donut')).toBeVisible()
  await expect(retail.getByText(/992\.87억 원/).first()).toBeVisible()
  await retail.getByLabel('비교 브랜드').selectOption({ label: '불닭볶음면' })
  await expect(retail.getByRole('link', { name: '불닭볶음면', exact: true })).toBeVisible()
  await retail.getByLabel('시장점유율 분기').selectOption({ label: '2025년 4분기' })
  await expect(retail.getByRole('heading', { name: '2025년 4분기 판매액 점유율' })).toBeVisible()
  await retail.getByRole('button', { name: '점유율', exact: true }).click()
  await expect(retail.getByRole('button', { name: '점유율', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const reported = performance.getByRole('article', { name: '라면 제품군 분기 공시 매출' })
  await expect(reported.getByRole('link', { name: '분기 원문' })).toHaveCount(3)
  await expect(page.locator('.comparison-mascot')).toHaveCSS('animation-name', 'none')
  await page.getByRole('group', { name: '종목 상세 탭' }).getByRole('button', { name: '기업정보' }).click()
  await expect(page.getByText('AI 상품 요약', { exact: true })).toBeVisible()
  await expect(page.getByText(/누들핏 컵면을 유통합니다/)).toBeVisible()
})

test('검색, 관심종목 및 자연어 조건 수정', async ({ page }) => {
  await page.route('**/api/v1/ai/discover', async route => {
    const response = await route.fetch()
    const result = await response.json()
    await route.fulfill({ response, json: { ...result, explanation: '제품에 표시된 제공량과 나트륨을 확인했습니다.' } })
  })
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
  const explanation = page.getByRole('region', { name: 'AI 탐색 설명' })
  const results = page.getByRole('heading', { name: '탐색 결과' })
  await expect(explanation).toContainText('제품에 표시된 제공량과 나트륨을 확인했습니다.')
  await expect(results).toBeVisible()
  expect((await explanation.boundingBox())!.y).toBeLessThan((await results.boundingBox())!.y)
  await expect(page.getByRole('group', { name: '상품군' }).getByRole('button', { name: '즉석 라면' })).toHaveAttribute('aria-pressed', 'true')
  const criteria = page.getByRole('group', { name: '비교 기준' })
  await expect(criteria.getByRole('button', { name: '나트륨' })).toHaveAttribute('aria-pressed', 'true')
  await criteria.getByRole('button', { name: '열량' }).click()
  await expect(criteria.getByRole('button', { name: '열량' })).toHaveAttribute('aria-pressed', 'true')
  await expect(results).toBeVisible()
})

test('홈 성분 탐색에서 제조사 표시와 기관 평가를 확인하고 관련 종목 이동', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '건강 이슈 성분으로 종목 찾기' }).click()
  await page.getByRole('textbox', { name: '성분·소재 검색' }).fill('보존료')
  const choices = page.getByRole('group', { name: '건강 이슈 성분' })
  await choices.getByRole('button', { name: /아질산나트륨/ }).click()
  const issue = page.getByRole('region', { name: '아질산나트륨 기관 평가' })
  await expect(issue).toContainText('발암 추정(2A군)')
  await expect(issue.getByRole('link', { name: /IARC/ })).toHaveAttribute('href', /iarc\.who\.int/)
  const stocks = page.getByRole('region', { name: '관련 종목' })
  await expect(stocks.getByRole('link', { name: '오스카 마이어 클래식 비프 프랭크' })).toBeVisible()
  await expect(stocks.getByRole('link', { name: '애플게이트 유기농 소고기 핫도그' })).toHaveCount(0)
  await choices.getByRole('button', { name: /안식향산칼륨/ }).click()
  await expect(stocks.getByRole('link', { name: '코카콜라 제로 슈거' })).toBeVisible()
  await expect(stocks.getByRole('link', { name: '코카콜라 오리지널' })).toHaveCount(0)
  await stocks.getByRole('link', { name: /코카콜라 KO/ }).click()
  await expect(page.getByRole('heading', { name: '코카콜라', exact: true })).toBeVisible()
})
