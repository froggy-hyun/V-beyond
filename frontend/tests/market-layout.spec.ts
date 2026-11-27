import { expect, test } from '@playwright/test'

test('시장 로딩 스켈레톤과 종목 로고 표시', async ({ page }) => {
  const catalog = '**/api/v1/stocks?market=KR'
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release = () => {}
  const ready = new Promise<void>(resolve => { release = resolve })
  await page.route(catalog, async route => { await ready; await route.continue() })
  await page.goto('/')
  await expect(page).toHaveTitle('V beyond')
  await expect(page.getByRole('status', { name: '종목 목록을 불러오고 있습니다' })).toBeVisible()
  await expect(page.locator('.route-content')).toHaveCSS('animation-name', 'none')
  await expect.poll(() => page.getByRole('link', { name: 'V beyond' }).locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  release()
  await expect(page.getByRole('status', { name: '종목 목록을 불러오고 있습니다' })).toHaveCount(0)
  await expect(page.locator('.market-list-row .stock-mark img')).toHaveCount(9)
  await expect.poll(() => page.locator('.market-list-row .stock-mark img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true)
})

test('시장 구분, 종목 검색 및 화면별 차트 이동', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '국내주식' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.market-list-row')).toHaveCount(9)
  await page.getByRole('button', { name: '프로', exact: true }).click()
  await expect(page.locator('.market-list-row').first().getByText(/^거래량/)).toBeVisible()
  await page.getByRole('button', { name: '간편', exact: true }).click()
  await page.getByRole('button', { name: '미국주식' }).click()
  await expect(page.getByRole('button', { name: '미국주식' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.market-list-row')).toHaveCount(19)
  await page.getByRole('combobox', { name: '종목 정렬' }).selectOption('volume')
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: '코카콜라 차트 미리보기' }).click()
    const preview = page.getByRole('region', { name: '종목 차트 미리보기' })
    await expect(preview.getByRole('heading', { name: '코카콜라', exact: true })).toBeVisible()
    await expect(preview.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
    await preview.getByRole('link', { name: '종목 상세' }).click()
  } else {
    await expect(page.getByRole('region', { name: '종목 차트 미리보기' })).toHaveCount(0)
    await page.locator('.market-list-row .stock-row').filter({ hasText: '코카콜라' }).click()
  }
  await expect(page.getByRole('heading', { name: '코카콜라', level: 1, exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('textbox', { name: '종목·브랜드 찾기' }).fill('Calphalon')
  await page.getByRole('textbox', { name: '종목·브랜드 찾기' }).press('Enter')
  await expect(page.getByRole('heading', { name: '통합 검색' })).toBeVisible()
  await expect(page.locator('.stock-row').filter({ hasText: '뉴웰 브랜즈' })).toBeVisible()
  await page.getByRole('button', { name: /^상품/ }).click()
  await expect(page.locator('.product-card').first()).toBeVisible()
  await expect(page.locator('.stock-row')).toHaveCount(0)
})

test('작은 모바일 화면의 좌우 넘침 방지', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '모바일 화면만 검증')
  await page.setViewportSize({ width: 320, height: 720 })
  for (const route of ['/', '/?market=US', '/stocks/US:NYSE:KO', '/products/coke-original', '/ai', '/compare', '/watchlist', '/menu']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  }
})

test('관심·검색·메뉴가 홈과 동일한 좌우 여백 사용', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '주식', exact: true })).toBeVisible()
  const home = (await page.locator('.market-page').boundingBox())!
  for (const [path, title] of [['/watchlist', '관심종목'], ['/search', '통합 검색'], ['/menu', '전체 메뉴']]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    const content = (await page.locator('.route-content > .page').boundingBox())!
    expect(content.x).toBeCloseTo(home.x, 0)
    expect(content.width).toBeCloseTo(home.width, 0)
  }
})

test('홈 지수 그래프와 종목 화면 메뉴 전환', async ({ page }) => {
  const observedAt = '2026-11-27T06:30:00Z'
  await page.route('**/api/v1/market/mode', route => route.fulfill({ json: { feedMode: 'KIS_REST' } }))
  await page.route('**/api/v1/market/indices?market=KR', route => route.fulfill({ json: [
    { code: 'KOSPI', value: 4800, change: 20, changePercent: .42, observedAt,
      points: [{ at: '2026-11-27T00:00:00Z', value: 4790 }, { at: observedAt, value: 4800 }] },
    { code: 'KOSDAQ', value: 700, change: -2, changePercent: -.28, observedAt,
      points: [{ at: '2026-11-27T00:00:00Z', value: 703 }, { at: observedAt, value: 700 }] },
  ] }))
  await page.route('**/api/v1/market/indices?market=US', route => route.fulfill({ json: [
    { code: 'SPX', value: 7100, change: 12, changePercent: .17, observedAt,
      points: [{ at: '2026-11-27T00:00:00Z', value: 7088 }, { at: observedAt, value: 7100 }] },
    { code: 'COMP', value: 23000, change: -77, changePercent: -.34, observedAt,
      points: [{ at: '2026-11-27T00:00:00Z', value: 23077 }, { at: observedAt, value: 23000 }] },
  ] }))
  await page.goto('/')
  const indices = page.getByRole('region', { name: '국내 시장 지수' })
  await expect(indices.getByText('4,800.00')).toBeVisible()
  await expect(indices.getByRole('img', { name: '코스닥 정규장 지수 그래프' })).toBeVisible()
  await expect(page.getByText(/비공식 서비스|시세 제공:|한국투자증권 시세/)).toHaveCount(0)
  await page.getByRole('button', { name: '미국주식' }).click()
  const usIndices = page.getByRole('region', { name: '미국 시장 지수' })
  await expect(usIndices.getByText('7,100.00', { exact: true })).toBeVisible()
  await expect(usIndices.getByRole('img', { name: '나스닥 종합 정규장 지수 그래프' })).toBeVisible()
  await expect(indices).toHaveCount(0)

  await expect(page.getByRole('navigation').getByRole('link', { name: '현재가', exact: true })).toHaveCount(0)
  await page.goto('/stocks/KR:KOSPI:004370?tab=price')
  const tabs = page.getByRole('group', { name: '종목 상세 탭' })
  await expect(tabs.getByRole('button', { name: '차트', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
  await tabs.getByRole('button', { name: '판매상품' }).click()
  await expect(page.locator('.stock-products .product-card').first()).toBeVisible()
  await page.goto('/menu')
  await expect(page.getByRole('link', { name: '현재가', exact: true })).toHaveCount(0)
})

test('종목 차트 구간과 분봉 선택', async ({ page }) => {
  await page.goto('/stocks/KR:KOSPI:004370')
  await expect(page.getByRole('heading', { name: '농심' })).toBeVisible()
  for (const [label, range] of [['1주', '1W'], ['1개월', '1M'], ['3개월', '3M'], ['1년', '1Y']]) {
    const response = page.waitForResponse(result => result.ok() && result.url().includes('/candles?') && result.url().includes('range=' + range))
    await page.getByRole('button', { name: label, exact: true }).click()
    await response
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
  }
  await page.getByRole('button', { name: '1일', exact: true }).click()
  const response = page.waitForResponse(result => result.ok() && result.url().includes('/candles?interval=5m'))
  await page.getByRole('button', { name: '5분 봉', exact: true }).click()
  await response
})

test('장중 새 봉이 들어와도 선택한 차트 유지', async ({ page }) => {
  const observedAt = '2026-11-27T00:02:30Z'
  await page.clock.install({ time: new Date(observedAt) })
  await page.route('**/api/v1/market/mode', route => route.fulfill({ json: { feedMode: 'KIS_REST' } }))
  await page.route('**/api/v1/market/quotes?**', route => route.fulfill({ json: [{
    listingId: 'KR:KOSPI:004370', price: 100, change: 0, changePercent: 0, cumulativeVolume: 10, currency: 'KRW',
    receivedAt: observedAt, exchangeTimestamp: null, feedMode: 'KIS_REST', freshness: 'FRESH', session: 'REGULAR',
  }] }))
  await page.route('**/api/v1/market/stream?**', route => route.fulfill({ status: 204 }))
  let refreshes = 0
  await page.route('**/api/v1/market/stocks/*/candles?**', route => {
    const times = refreshes++ ? ['00:01', '00:02', '00:03'] : ['00:01', '00:02']
    return route.fulfill({ json: times.map((time, index) => ({
      startAt: '2026-11-27T' + time + ':00Z', open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 10,
    })) })
  })
  await page.goto('/stocks/KR:KOSPI:004370?range=1D&interval=1m')
  await expect(page.getByText(/마지막 봉.*9:02/)).toBeVisible()
  const canvas = page.locator('.price-chart canvas').first()
  await canvas.evaluate(element => element.setAttribute('data-before-update', 'true'))
  await page.clock.fastForward(17_000)
  await expect(page.getByText(/마지막 봉.*9:03/)).toBeVisible()
  await expect(canvas).toHaveAttribute('data-before-update', 'true')
  await expect(page.getByRole('button', { name: '1분 봉', exact: true })).toHaveClass('selected')
})
