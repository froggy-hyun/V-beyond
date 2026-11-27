import { expect, test } from '@playwright/test'

test('시장 구분, 종목 검색 및 화면별 차트 이동', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '국내주식' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.market-list-row')).toHaveCount(4)
  await page.getByRole('button', { name: '미국주식' }).click()
  await expect(page.getByRole('button', { name: '미국주식' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.market-list-row')).toHaveCount(6)
  await page.getByRole('combobox', { name: '종목 정렬' }).selectOption('volume')
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: '코카콜라 차트 미리보기' }).click()
    const preview = page.getByRole('region', { name: '종목 차트 미리보기' })
    await expect(preview.getByRole('heading', { name: '코카콜라' })).toBeVisible()
    await expect(preview.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()
    await preview.getByRole('link', { name: '종목 상세' }).click()
  } else {
    await expect(page.getByRole('region', { name: '종목 차트 미리보기' })).toHaveCount(0)
    await page.locator('.market-list-row .stock-row').filter({ hasText: '코카콜라' }).click()
  }
  await expect(page.getByRole('heading', { name: '코카콜라' })).toBeVisible()
  await expect(page.getByRole('img', { name: '시세 및 거래량 차트' })).toBeVisible()

  await page.goto('/')
  await page.getByRole('textbox', { name: '종목·브랜드 찾기' }).fill('Calphalon')
  await page.getByRole('textbox', { name: '종목·브랜드 찾기' }).press('Enter')
  await expect(page.getByRole('heading', { name: '통합 검색' })).toBeVisible()
  await expect(page.locator('.stock-row').filter({ hasText: '뉴웰 브랜즈' })).toBeVisible()
})

test('작은 모바일 화면의 좌우 넘침 방지', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '모바일 화면만 검증')
  await page.setViewportSize({ width: 320, height: 720 })
  for (const route of ['/', '/?market=US', '/stocks/US:NYSE:KO', '/products/coke-original', '/ai', '/compare']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  }
})
