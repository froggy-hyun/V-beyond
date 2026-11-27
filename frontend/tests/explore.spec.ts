import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

async function getAfterRateLimit(request: APIRequestContext, path: string) {
  let response = await request.get(path)
  if (response.status() === 429) await expect.poll(async () => {
    await response.dispose()
    response = await request.get(path)
    return response.status()
  }).not.toBe(429)
  return response
}

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
    await expect(page.getByRole('link', { name: '관련 종목', exact: true })).toHaveCount(0)
    await expect.poll(() => page.getByRole('img', { name: /제품 사진$/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByRole('link', { name: '사진 출처' })).toHaveAttribute('href', /^https:\/\//)
    await expect(page.locator('.evidence .source').first()).toBeVisible()
    await page.getByRole('link', { name: '대안 상품 탐색' }).click()
    const grid = page.locator('.comparison-card-grid')
    const card = grid.getByRole('article').filter({ hasText: scenario.alternative }).first()
    await expect(card).toBeVisible()
    await expect(card.locator('.stock-row .stock-mark img')).toBeVisible()
    await expect(card.locator('.stock-row .quote-value strong')).toBeVisible({ timeout: 12_000 })
    expect((await card.boundingBox())!.width).toBeLessThan((await grid.boundingBox())!.width)
    await grid.locator('.stock-row').filter({ hasText: scenario.competitor }).first().click()
    await expect(page.getByRole('heading', { name: scenario.competitor })).toBeVisible()
    await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
  })
}

test('대안 상품이 확인되는 기준만 기업 범위에 맞춰 활성화', async ({ page }) => {
  await page.goto('/products/calphalon-premier/alternatives?criterion=AVOID_PTFE')
  const criteria = page.getByRole('group', { name: '비교 기준' })
  const ptfe = criteria.getByRole('button', { name: 'PTFE 미사용', exact: true })
  const pfas = criteria.getByRole('button', { name: 'PFAS 미사용', exact: true })
  await expect(ptfe).toBeEnabled({ timeout: 12_000 })
  await expect(ptfe).toHaveAttribute('aria-pressed', 'true')
  await expect(criteria.getByRole('button', { name: '나트륨', exact: true })).toBeDisabled()
  await page.getByRole('group', { name: '기업 관계' }).getByRole('button', { name: '같은 기업' }).click()
  await expect(ptfe).toBeDisabled()
  await expect(pfas).toBeEnabled()
  await expect(pfas).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.comparison-card-grid .comparison-card')).toHaveCount(1)

  await page.goto('/products/lg-puricare-wd523vhm/alternatives')
  await expect(page.getByText('선택하신 기업 범위에서 확인된 대안 상품이 없습니다.')).toBeVisible()
  await expect(criteria.locator('button:not([disabled])')).toHaveCount(0)
  await expect(page.locator('.comparison-card-grid')).toHaveCount(0)
})

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
  const winner = red.locator('.comparison-card[data-winner="true"]')
  const sticker = winner.locator('.winner-sticker')
  await expect(sticker).toHaveText('WINNER')
  await expect(sticker.locator('img')).toBeVisible()
  await expect(winner.locator('.winner-reason')).toHaveText('나트륨 낮음')
  await expect(winner).toHaveCSS('animation-name', 'winner-float')
  const ownBox = (await red.locator('.health-pair > .comparison-card').boundingBox())!
  const versusBox = (await red.locator('.vs-badge').boundingBox())!
  const peerBox = (await red.getByRole('group', { name: '타 기업 비교 상품' }).boundingBox())!
  if (page.viewportSize()!.width >= 840) {
    expect(ownBox.x + ownBox.width).toBeLessThan(versusBox.x)
    expect(versusBox.x + versusBox.width).toBeLessThan(peerBox.x)
  } else {
    expect(ownBox.y + ownBox.height).toBeLessThan(versusBox.y)
    expect(versusBox.y + versusBox.height).toBeLessThan(peerBox.y)
  }
  await expect(red.getByRole('link', { name: /종목 바로가기/ })).toHaveCount(0)
  await expect(red.locator('.health-peers .stock-row')).toHaveCount(3)
  await expect(winner.locator('.stock-mark img')).toBeVisible()
  await expect(winner.locator('.stock-row')).toContainText('017810 · KOSPI')
  await expect(winner.locator('.stock-row .quote-value strong')).toBeVisible({ timeout: 12_000 })
  const sodiumEvidence = red.getByRole('region', { name: '나트륨 건강 쟁점' })
  await expect(red.locator('.health-topic')).toHaveCount(1)
  await expect(sodiumEvidence.getByText('고혈압 · 심혈관질환')).toBeVisible()
  await expect(sodiumEvidence.getByRole('link', { name: 'WHO 나트륨 감량 권고' })).toHaveAttribute('href', /who\.int/)
  await expect(sodiumEvidence.getByRole('link', { name: /무작위시험/ })).toHaveAttribute('href', /pubmed\.ncbi/)
  const light = comparison.getByRole('article', { name: '신라면 건면 건강 이슈 비교' })
  await expect(light.getByText('1,790 mg', { exact: true })).toBeVisible()
  await expect(light.locator('.health-peers .stock-row')).toHaveCount(3)
  const pageWidth = (await page.locator('.stock-page').boundingBox())!.width
  expect((await comparison.boundingBox())!.width).toBeCloseTo(pageWidth, 0)

  const tabs = page.getByRole('group', { name: '종목 상세 탭' })
  await tabs.getByRole('button', { name: '판매상품' }).click()
  await expect(page.getByRole('heading', { name: '판매 상품', exact: true })).toBeVisible()
  await expect(comparison).toHaveCount(0)
  await tabs.getByRole('button', { name: '차트', exact: true }).click()
  const jump = winner.getByRole('link', { name: /풀무원/ })
  if (page.viewportSize()!.width >= 840) {
    await jump.hover({ force: true })
    await expect(winner).toHaveCSS('animation-play-state', 'paused')
  } else {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
  await jump.click()
  await expect(page.getByRole('heading', { name: '풀무원', exact: true })).toBeVisible()
  await expect(chart).toBeVisible()
})

test('종목 비교에서 소재와 성분 기준별 검증 결과 표시', async ({ request, page }) => {
  const soup = await getAfterRateLimit(request, '/api/v1/stocks/US:NASDAQ:CPB/health-comparisons')
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
  await expect(pan.locator('.stock-row').filter({ hasText: '윌리엄스 소노마' })).toBeVisible()

  await page.goto('/stocks/US:NYSE:KO')
  const cola = page.getByRole('article', { name: '코카콜라 오리지널 건강 이슈 비교' })
  await expect(cola.getByText('10.99 g')).toBeVisible()
  await expect(cola.locator('.health-topic')).toHaveCount(1)
  await expect(cola.getByRole('region', { name: '당류 건강 쟁점' })).toContainText('치아우식증(충치)')
  await expect(cola.getByText('아스파탐 사용 확인')).toHaveCount(0)
  await cola.getByRole('button', { name: '아스파탐', exact: true }).click()
  await expect(cola.locator('.health-peers .stock-row')).toHaveCount(3)
  await expect(cola.locator('.health-topic')).toHaveCount(1)
  await expect(cola.getByRole('region', { name: '당류 건강 쟁점' })).toHaveCount(0)
  await expect(cola.getByText(/10\.99 g/)).toHaveCount(0)
  await expect(cola.getByRole('region', { name: '아스파탐 건강 쟁점' }).getByRole('link', { name: /IARC·JECFA/ })).toBeVisible()
  await cola.getByRole('button', { name: '당류', exact: true }).click()
  await expect(cola.getByRole('region', { name: '아스파탐 건강 쟁점' })).toHaveCount(0)
  await expect(cola.getByRole('region', { name: '당류 건강 쟁점' })).toBeVisible()
  const zero = page.getByRole('article', { name: '코카콜라 제로 슈거 건강 이슈 비교' })
  await expect(zero.getByRole('region', { name: '안식향산칼륨 건강 이슈' })).toHaveCount(0)
  await expect(zero.getByText('간세포암 가능성 · 페닐케톤뇨증')).toBeVisible()
  await expect(zero.locator('details')).toHaveCount(0)

  const nuggets = await getAfterRateLimit(request, '/api/v1/stocks/US:NYSE:CAG/health-comparisons')
  expect(nuggets.ok()).toBe(true)
  expect(await nuggets.json()).toEqual(expect.arrayContaining([expect.objectContaining({ product: expect.objectContaining({ id: 'banquet-original-nuggets' }), issues: [expect.objectContaining({
    baseline: expect.objectContaining({ criterion: 'SODIUM', basis: 'PER_100G' }),
    alternative: expect.objectContaining({ stock: expect.objectContaining({ symbol: 'TSN' }), fact: expect.objectContaining({ basis: 'PER_100G' }) }),
  })] })]))
})

test('브랜드 판매액과 분기 점유율, 공시 매출 및 AI 상품 소개', async ({ page }) => {
  let overviewReady = false
  await page.route('**/api/v1/stocks/*/product-overview', route => route.fulfill({ json: {
    status: overviewReady ? 'AI' : 'PENDING',
    text: overviewReady ? '농심은 신라면과 신라면 건면을 제조하고 누들핏 컵면을 유통합니다.' : '농심의 등록 상품으로는 신라면 등이 있습니다.',
  } }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/stocks/KR:KOSPI:004370')
  const performance = page.getByRole('region', { name: '상품 매출 · 시장점유율' })
  const retail = performance.getByRole('article', { name: '국내 라면 소매시장' })
  await expect(retail.getByRole('heading', { name: '2026년 1분기 판매액 점유율' })).toBeVisible({ timeout: 12_000 })
  await expect(retail.locator('.performance-donut')).toBeVisible()
  await expect(retail.getByText(/992\.87억 원/).first()).toBeVisible()
  await expect(retail.getByLabel('비교 브랜드')).toHaveCount(0)
  const peers = retail.locator('.performance-brand[data-own="false"]')
  await expect(peers).toHaveCount(2)
  await expect(retail.getByRole('link', { name: '불닭볶음면 종목 상세' })).toHaveAttribute('href', '/stocks/KR%3AKOSPI%3A003230')
  const ownPhoto = retail.locator('.performance-brand[data-own="true"] .product-photo')
  expect((await ownPhoto.boundingBox())!.width).toBeGreaterThan((await peers.first().locator('.product-photo').boundingBox())!.width)
  await expect(peers.first().locator('.stock-mark img')).toBeVisible()
  const connectors = retail.locator('.performance-connectors path')
  await expect(connectors).toHaveCount(3)
  await expect(connectors.first()).toHaveCSS('stroke-dasharray', '3px, 3px')
  await expect(retail.locator('.performance-bars .performance-bar-group').last().locator('.performance-bar-name')).toHaveText(['신라면', '진라면', '불닭볶음면'])
  await expect(retail.locator('.performance-bars .performance-bar-row').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await retail.getByLabel('시장점유율 분기').selectOption({ label: '2025년 4분기' })
  await expect(retail.getByRole('heading', { name: '2025년 4분기 판매액 점유율' })).toBeVisible()
  await retail.getByRole('button', { name: '점유율', exact: true }).click()
  await expect(retail.getByRole('button', { name: '점유율', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const reported = performance.getByRole('article', { name: '라면 제품군 분기 공시 매출' })
  await expect(reported.getByRole('link', { name: '분기 원문' })).toHaveCount(3)
  await expect(page.locator('.comparison-card[data-winner="true"]').first()).toHaveCSS('animation-name', 'none')
  await expect(retail.locator('.performance-donut')).toHaveCSS('transition-duration', '0s')
  await expect(retail.locator('.performance-bars .bar-fill').first()).toHaveCSS('transition-duration', '0s')
  await page.getByRole('group', { name: '종목 상세 탭' }).getByRole('button', { name: '기업정보' }).click()
  const loadingOverview = page.getByRole('status', { name: 'AI 기업 소개를 불러오고 있습니다' })
  await expect(loadingOverview).toBeVisible()
  await expect(page.getByText(/농심의 등록 상품으로는|라면·스낵 제조사입니다/)).toHaveCount(0)
  overviewReady = true
  await expect(page.getByText('AI 상품 요약', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(loadingOverview).toHaveCount(0)
  await expect(page.getByText(/누들핏 컵면을 유통합니다/)).toBeVisible()
})

test('판매 점유율이 채워진 뒤 분기별 막대가 순차적으로 나타남', async ({ page }) => {
  await page.goto('/stocks/KR:KOSPI:004370')
  const donut = page.locator('.performance-donut')
  const bars = page.locator('.performance-bars')
  await expect(donut).toHaveAttribute('data-visible', 'false', { timeout: 12_000 })
  await expect(bars.locator('.bar-fill').first()).toHaveCSS('width', '0px')
  await bars.evaluate(element => element.addEventListener('transitionstart', () => {
    const ring = element.closest('.performance-grid')!.querySelector('.performance-donut')!
    element.dataset.firstBarRing ??= getComputedStyle(ring).getPropertyValue('--donut-progress')
  }))
  const progress = () => donut.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--donut-progress')))
  expect(await progress()).toBe(0)
  await donut.scrollIntoViewIfNeeded()
  await expect(donut).toHaveAttribute('data-visible', 'true')
  await expect.poll(async () => {
    const current = await progress()
    return current > 0 && current < 1
  }, { intervals: [15, 30, 50] }).toBe(true)
  await expect.poll(progress).toBe(1)
  await bars.scrollIntoViewIfNeeded()
  await expect(bars).toHaveAttribute('data-visible', 'true')
  await expect.poll(async () => Number.parseFloat((await bars.getAttribute('data-first-bar-ring')) ?? '0')).toBe(1)
  await expect.poll(() => bars.locator('.bar-fill').first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0)
  await expect(bars.locator('.performance-bar-group').last().locator('.bar-fill').first()).toHaveCSS('transition-delay', '0.26s')
})

test('시장 자료가 있는 브랜드를 함께 표시하고 타사 종목으로 이동', async ({ page }) => {
  await page.route('**/*004370/revenue-segments', async route => {
    const response = await route.fetch()
    if (!response.ok()) return route.fulfill({ response })
    const data = await response.json()
    const jin = data.markets[0]?.brands.find((brand: { name: string }) => brand.name === '진라면')
    if (jin) jin.amounts[4] = null
    await route.fulfill({ response, json: data })
  })
  await page.goto('/stocks/KR:KOSPI:004370')
  const retail = page.getByRole('article', { name: '국내 라면 소매시장' })
  await expect(retail.getByRole('heading', { name: '2026년 1분기 판매액 점유율' })).toBeVisible()
  await expect(retail.locator('.performance-bars .performance-bar-group').last().locator('.performance-bar-name')).toHaveText(['신라면', '불닭볶음면'])
  await expect(retail.getByRole('link', { name: '진라면 종목 상세' })).toHaveCount(0)
  await retail.getByLabel('시장점유율 분기').selectOption({ label: '2025년 4분기' })
  const ottogi = retail.getByRole('link', { name: '진라면 종목 상세' })
  await expect(ottogi.locator('.product-photo img')).toBeVisible()
  await expect(ottogi.locator('.stock-mark img')).toBeVisible()
  await ottogi.click()
  await expect(page.getByRole('heading', { name: '오뚜기', exact: true })).toBeVisible()
  await expect(page.locator('.performance-brand[data-own="true"]')).toContainText('진라면')
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
  const cards = page.getByRole('region', { name: '탐색 결과' }).getByRole('article')
  await expect(cards.nth(1)).toBeVisible()
  const [first, second] = await cards.evaluateAll(elements => elements.slice(0, 2).map(element => element.getBoundingClientRect().toJSON()))
  expect(first.y).toBeCloseTo(second.y, 0)
  expect(first.x + first.width).toBeLessThan(second.x)
  await expect(cards.first().getByRole('link', { name: '상품 자료' })).toBeVisible()
  await expect(cards.first().locator('.stock-row .quote-value strong')).toBeVisible({ timeout: 12_000 })
  await expect(page.getByRole('group', { name: '상품군' }).getByRole('button', { name: '즉석 라면' })).toHaveAttribute('aria-pressed', 'true')
  const criteria = page.getByRole('group', { name: '비교 기준' })
  await expect(criteria.getByRole('button', { name: '나트륨' })).toHaveAttribute('aria-pressed', 'true')
  await expect(criteria.getByRole('button', { name: 'PTFE 미사용' })).toHaveCount(0)
  await criteria.getByRole('button', { name: '열량' }).click()
  await expect(criteria.getByRole('button', { name: '열량' })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards.first().locator('.comparison-value')).toContainText('kcal')
  await page.getByRole('group', { name: '상품군' }).getByRole('button', { name: '프라이팬' }).click()
  await expect(criteria.getByRole('button', { name: 'PTFE 미사용' })).toBeVisible()
  await expect(criteria.getByRole('button', { name: '나트륨' })).toHaveCount(0)
  await expect(results).toHaveCount(0)
  expect(new URL(page.url()).searchParams.has('criterion')).toBe(false)
})

test('홈에서 종목 찾기와 상품 찾기를 각각 이용', async ({ page }) => {
  await page.goto('/')
  const stocks = page.getByRole('region', { name: '종목 찾기', exact: true })
  const products = page.getByRole('region', { name: '상품 찾기', exact: true })
  const naturalDiscovery = page.getByRole('link', { name: '자연어로 탐색', exact: true })
  await expect(stocks.getByRole('link', { name: '건강 이슈 성분으로 종목 찾기' })).toBeVisible()
  await expect(products.getByRole('link', { name: '즉석 라면' })).toBeVisible()
  const productsBox = (await products.boundingBox())!
  expect(productsBox.y + productsBox.height).toBeLessThan((await naturalDiscovery.boundingBox())!.y)
  await expect(page.getByRole('main').getByRole('link', { name: '관심종목', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: '관심', exact: true })).toBeVisible()
  const footer = page.locator('footer')
  const credit = footer.getByText('제1회 하나증권 청년금융아이디어 공모전 최성현', { exact: true })
  await expect(credit).toBeVisible()
  const logoBox = (await footer.getByRole('img', { name: 'V beyond' }).boundingBox())!
  expect(logoBox.x + logoBox.width).toBeLessThan((await credit.boundingBox())!.x)
  await stocks.getByRole('link', { name: '상품군으로 종목 찾기' }).click()
  const companies = page.getByRole('region', { name: '관련 종목' })
  await expect(companies.locator('.stock-row')).toHaveCount(4)
  await expect(companies.locator('.stock-row').filter({ hasText: '농심' })).toBeVisible()
  await page.goto('/')
  await products.getByRole('link', { name: '즉석 라면' }).click()
  const items = page.getByRole('region', { name: '등록 상품' })
  await expect(items.getByRole('link', { name: '신라면', exact: true })).toBeVisible()
  await expect(items.locator('.comparison-card .stock-row')).toHaveCount(0)
  await page.getByRole('group', { name: '판매 시장' }).getByRole('button', { name: '미국' }).click()
  await expect(items.getByText('선택한 시장에 등록 상품이 없습니다.')).toBeVisible()
  await page.getByRole('button', { name: '토마토 케첩' }).click()
  await expect(items.getByRole('link', { name: '헌트 토마토 케첩' })).toBeVisible()
  await expect(items.getByRole('link', { name: '하인즈 무첨가당 토마토 케첩' })).toBeVisible()
})

test('홈 성분 탐색에서 제조사 표시와 기관 평가를 확인하고 관련 종목 이동', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '건강 이슈 성분으로 종목 찾기' }).click()
  await page.getByRole('textbox', { name: '성분·소재 검색' }).fill('보존료')
  const choices = page.getByRole('group', { name: '건강 이슈 성분' })
  await choices.getByRole('button', { name: /아질산나트륨/ }).click()
  const issue = page.getByRole('region', { name: '아질산나트륨 기관 평가' })
  await expect(issue).toContainText('발암 추정(2A군)')
  await expect(issue.getByRole('link', { name: /IARC/ })).toHaveAttribute('href', /ncbi\.nlm\.nih\.gov/)
  await expect(issue.getByRole('list', { name: '연구·기관 근거' }).getByText(/인체 관찰 연구, 동물실험/)).toBeVisible()
  await expect(issue.getByText('해석 범위', { exact: true })).toHaveCount(0)
  const stocks = page.getByRole('region', { name: '관련 종목' })
  await expect(stocks.getByRole('link', { name: '오스카 마이어 클래식 비프 프랭크' })).toBeVisible()
  await expect(stocks.getByRole('link', { name: '애플게이트 유기농 소고기 핫도그' })).toHaveCount(0)
  await expect(choices.getByRole('button', { name: /안식향산칼륨|소브산칼륨/ })).toHaveCount(0)
  await page.getByRole('textbox', { name: '성분·소재 검색' }).fill('간세포암')
  await choices.getByRole('button', { name: /아스파탐/ }).click()
  await expect(stocks.getByRole('link', { name: '코카콜라 제로 슈거' })).toBeVisible()
  await expect(stocks.getByRole('link', { name: '코카콜라 오리지널' })).toHaveCount(0)
  const coke = stocks.locator('.topic-company').filter({ has: page.getByRole('link', { name: /코카콜라 KO/ }) })
  const cards = coke.locator('.comparison-card-grid > .comparison-card')
  await expect(cards).toHaveCount(2)
  const [first, second] = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()))
  expect(first.y).toBeCloseTo(second.y, 0)
  expect(first.x + first.width).toBeLessThan(second.x)
  await expect(cards.first().getByRole('link', { name: '상품 근거' })).toBeVisible()
  await cards.first().scrollIntoViewIfNeeded()
  await expect.poll(() => cards.first().locator('.product-photo img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await stocks.getByRole('link', { name: /코카콜라 KO/ }).click()
  await expect(page.getByRole('heading', { name: '코카콜라', exact: true })).toBeVisible()
})

test('근거가 빠진 비교 항목과 타사 매출 대체 표시 제외', async ({ request, page }) => {
  const response = await getAfterRateLimit(request, '/api/v1/stocks/US:NASDAQ:NWL/health-comparisons')
  expect(response.ok()).toBe(true)
  const comparisons = await response.json()
  expect(comparisons.length).toBeGreaterThan(0)
  expect(comparisons.some((row: { product: { id: string } }) => row.product.id === 'calphalon-steel')).toBe(false)

  const alternative = await getAfterRateLimit(request, '/api/v1/products/calphalon-steel/alternatives?criterion=AVOID_PTFE')
  expect(alternative.ok()).toBe(true)
  expect(await alternative.json()).toMatchObject({ baseline: null, matches: [] })

  const market = await getAfterRateLimit(request, '/api/v1/stocks/KR:KOSPI:017810/revenue-segments')
  expect(market.ok()).toBe(true)
  expect(await market.json()).toMatchObject({ markets: [] })
  await page.goto('/stocks/US:NASDAQ:NWL')
  await expect(page.getByRole('region', { name: '판매 상품 건강 이슈 비교' }).getByText('사용 확인', { exact: true })).toBeVisible()
  await expect(page.getByText('자료 없음', { exact: true })).toHaveCount(0)
  await page.goto('/products/calphalon-steel')
  await expect(page.getByRole('heading', { name: '상품 근거', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '대안 상품 탐색' })).toHaveCount(0)
})
