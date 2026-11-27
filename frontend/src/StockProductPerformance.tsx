import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Link } from 'react-router-dom'
import { pathFor, useData } from './api'
import type { Stock } from './api'
import { ProductPhoto, Source, StockMark, Wait } from './ui'

type QuarterSales = { quarter: string; periodEnd: string; amount: number; source: string; note?: string }
type Segment = { name: string; scope: string; currency: string; quarters: QuarterSales[] }
type Brand = { name: string; stockId: string; productId: string; amounts: (number | null)[] }
type MarketPeriod = { quarter: string; total: number; brands: BrandSales[] }
type BrandSales = { brand: Brand; own: boolean; color: string; amount: number }
type MarketSlice = { id: string; color: string; start: number; end: number }
type Market = { name: string; scope: string; source: string; quarters: { quarter: string; total: number }[]; brands: Brand[] }
type Overview = { source: string; segments: Segment[]; markets: Market[] }

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
const quarterLabel = (value: string) => value.replace(/^FY\s*/, '회계 ').replace(/\s*Q([1-4])/, '년 $1분기')
const amounts = (amount: number, currency = 'KRW') => currency === 'KRW'
  ? number.format(amount / 100_000_000) + '억 원' : number.format(amount / 1_000_000) + '백만 달러'
const share = (amount: number, total: number) => total > 0 ? amount / total * 100 : 0
const peerColors = ['#4a79ca', '#9167cc', '#ba7234', '#388aa5']
const ownColors = ['#007d70', '#139989', '#457a62']

function marketPeriods(market: Market, stockId: string): MarketPeriod[] {
  const own = market.brands.filter(brand => brand.stockId === stockId)
  const peers = market.brands.filter(brand => brand.stockId !== stockId)
  const series = [
    ...own.map((brand, index) => ({ brand, own: true, color: ownColors[index % ownColors.length] })),
    ...peers.map((brand, index) => ({ brand, own: false, color: peerColors[index % peerColors.length] })),
  ]
  return market.quarters.flatMap((period, index) => {
    if (period.total <= 0) return []
    const brands = series.flatMap(entry => {
      const amount = entry.brand.amounts[index]
      return amount != null && amount >= 0 ? [{ ...entry, amount }] : []
    })
    return brands.some(brand => brand.own) ? [{ ...period, brands }] : []
  })
}

function useChartReveal(threshold: number) {
  const chart = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    if (!chart.current || visible) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= threshold) setVisible(true)
    }, { threshold })
    observer.observe(chart.current)
    return () => observer.disconnect()
  }, [threshold, visible])
  return [chart, visible] as const
}

export default function StockProductPerformance({ stock }: { stock: Stock }) {
  const result = useData<Overview>(pathFor(stock.id) + '/revenue-segments')
  const markets = result.data?.markets.flatMap(market => {
    const periods = marketPeriods(market, stock.id)
    return periods.length ? [{ market, periods }] : []
  })
  if (result.data && !markets?.length && !result.data.segments.length) return null
  return <section className="panel stock-wide" aria-labelledby="product-finance-heading">
    <header><h2 id="product-finance-heading">상품 매출 · 시장점유율</h2>
      <p>상품이 속한 브랜드의 소매 판매액과 공시 사업군 실적을 확인할 수 있습니다.</p></header>
    {result.data ? <>
      {markets?.map(({ market, periods }) => <RetailComparison key={market.name} market={market} periods={periods} />)}
      {result.data.segments.map(segment => <ReportedSegment key={segment.name} segment={segment} />)}
    </> : <Wait error={result.error} kind="products" />}
  </section>
}

function RetailComparison({ market, periods }: { market: Market; periods: MarketPeriod[] }) {
  const [selectedQuarter, setSelectedQuarter] = useState('')
  const [metric, setMetric] = useState<'sales' | 'share'>('sales')
  const [donut, donutInView] = useChartReveal(.4)
  const [trend, revealTrend] = useChartReveal(.25)
  const chart = useRef<HTMLDivElement>(null)
  const [donutFinished, setDonutFinished] = useState(false)
  const revealDonut = donutInView || revealTrend
  const quarter = periods.find(period => period.quarter === selectedQuarter) ?? periods[periods.length - 1]
  useEffect(() => {
    const element = donut.current
    if (!element || !revealDonut || donutFinished) return
    let active = true
    const frame = requestAnimationFrame(() => {
      const transitions = element.getAnimations?.() ?? []
      void Promise.allSettled(transitions.map(transition => transition.finished)).then(() => {
        if (active) setDonutFinished(true)
      })
    })
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [donut, revealDonut, donutFinished])

  let combined = 0
  const slices = quarter.brands.map(entry => {
    const start = combined
    combined = Math.min(100, combined + share(entry.amount, quarter.total))
    return { id: entry.brand.productId, color: entry.color, start, end: combined }
  })
  const stops = slices.map(({ color, start, end }) =>
    `${color} calc(var(--donut-progress) * ${start}%) calc(var(--donut-progress) * ${end}%)`)
  const measured = periods.map(period => ({
    quarter: period.quarter,
    brands: period.brands.map(entry => ({
      ...entry, value: metric === 'share' ? share(entry.amount, period.total) : entry.amount,
    })),
  }))
  const max = Math.max(1, ...measured.flatMap(period => period.brands.map(entry => entry.value)))
  return <article className="performance-card" aria-label={market.name}>
    <div className="section-heading"><div><h3>{market.name}</h3><p>{market.scope}</p></div><Source href={market.source}>조사 원문</Source></div>
    <div className="performance-controls">
      <label>시장점유율 분기 <select value={quarter.quarter} onChange={event => setSelectedQuarter(event.target.value)}>
        {periods.map(period => <option key={period.quarter} value={period.quarter}>{quarterLabel(period.quarter)}</option>)}</select></label>
    </div>
    <div className="performance-grid">
      <div className="performance-share">
        <h4>{quarterLabel(quarter.quarter)} 판매액 점유율</h4>
        <div className="performance-share-visual" ref={chart}>
          <div ref={donut} className="performance-donut" data-visible={revealDonut}
            style={{ backgroundImage: 'conic-gradient(' + stops.join(', ') + ', var(--chart-track) 0)' }}>
            <div className="performance-market-total"><small>시장 전체</small><strong>{amounts(quarter.total)}</strong></div>
          </div>
          <MarketConnectors chart={chart} donut={donut} slices={slices} visible={revealDonut} />
          <div className="performance-callouts" role="group" aria-label="브랜드별 판매액 점유율">
            {quarter.brands.map(entry => <BrandCallout key={entry.brand.productId} entry={entry} total={quarter.total} />)}
            {combined < 100 && <small>기타 브랜드 {number.format(100 - combined)}%</small>}
          </div>
        </div>
      </div>
      <div>
        <div className="section-heading"><h4>분기별 브랜드 추이</h4><div className="segmented" role="group" aria-label="브랜드 추이 지표">
          <button aria-pressed={metric === 'sales'} className={metric === 'sales' ? 'selected' : ''} onClick={() => setMetric('sales')}>판매액</button>
          <button aria-pressed={metric === 'share'} className={metric === 'share' ? 'selected' : ''} onClick={() => setMetric('share')}>점유율</button>
        </div></div>
        <div ref={trend} className="performance-bars" aria-label="분기별 브랜드 비교" data-visible={donutFinished && revealTrend}>
          {measured.map((period, index) => <div className="performance-bar-group" key={period.quarter}>
            <small>{quarterLabel(period.quarter)}</small>
            {period.brands.map(({ brand, value, color }, rank) => <div className="performance-bar-row" key={brand.productId} style={{ '--brand-color': color } as CSSProperties}>
              <span className="bar-fill" aria-hidden style={{
                '--bar-width': (value / max * 100) + '%', '--bar-delay': (index * 65 + rank * 25) + 'ms',
              } as CSSProperties} />
              <span className="performance-bar-name">{brand.name}</span>
              <strong>{metric === 'share' ? number.format(value) + '%' : amounts(value)}</strong>
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
  </article>
}

function MarketConnectors({ chart, donut, slices, visible }: {
  chart: RefObject<HTMLDivElement | null>; donut: RefObject<HTMLDivElement | null>; slices: MarketSlice[]; visible: boolean
}) {
  const [paths, setPaths] = useState<{ id: string; color: string; line: string }[]>([])
  useEffect(() => {
    const frame = chart.current
    const ring = donut.current
    if (!frame || !ring) return
    const cards = frame.querySelectorAll('.performance-brand-card')
    const draw = () => {
      const outer = frame.getBoundingClientRect()
      const bounds = ring.getBoundingClientRect()
      const radius = bounds.width / 2
      const centerX = bounds.left - outer.left + radius
      const centerY = bounds.top - outer.top + radius
      setPaths(slices.flatMap(({ id, color, start, end }, index) => {
        const card = cards[index]?.getBoundingClientRect()
        if (!card || end <= start || radius === 0) return []
        const angle = (start + end) * Math.PI / 100
        const x = centerX + radius * Math.sin(angle)
        const y = centerY - radius * Math.cos(angle)
        const leadX = centerX + (radius + 4) * Math.sin(angle)
        const leadY = centerY - (radius + 4) * Math.cos(angle)
        const endX = card.left - outer.left
        const endY = card.top - outer.top + card.height / 2
        const bendX = (bounds.right - outer.left + endX) / 2
        const line = `M ${x} ${y} L ${leadX} ${leadY} C ${bendX} ${leadY}, ${bendX} ${endY}, ${endX} ${endY}`
        return [{ id, color, line }]
      }))
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(frame)
    observer.observe(ring)
    cards.forEach(card => observer.observe(card))
    return () => observer.disconnect()
  }, [chart, donut, slices])
  return <svg className="performance-connectors" data-visible={visible} aria-hidden="true">
    {paths.map(path => <path key={path.id} d={path.line} stroke={path.color} />)}
  </svg>
}

function BrandCallout({ entry: { brand, amount, color, own }, total }: { entry: BrandSales; total: number }) {
  const symbol = brand.stockId.slice(brand.stockId.lastIndexOf(':') + 1)
  const details = <>
    <ProductPhoto product={{ id: brand.productId, name: brand.name }} />
    <div className="performance-brand-label">
      <div className="performance-brand-name">{!own && <StockMark stock={{ symbol }} />}<strong>{brand.name}</strong></div>
      <span className="performance-brand-share">{number.format(share(amount, total))}%</span>
      <small>{amounts(amount)}</small>
    </div>
  </>
  return <div className="performance-brand" data-own={own} style={{ '--brand-color': color } as CSSProperties}>
    {own ? <div className="performance-brand-card">{details}</div>
      : <Link className="performance-brand-card" to={pathFor(brand.stockId)} aria-label={brand.name + ' 종목 상세'}>{details}</Link>}
  </div>
}

function ReportedSegment({ segment }: { segment: Segment }) {
  const max = Math.max(1, ...segment.quarters.map(quarter => quarter.amount))
  return <article className="performance-card" aria-label={segment.name + ' 분기 공시 매출'}>
    <h3>{segment.name} · 분기 공시 매출</h3><p>{segment.scope}</p>
    <div className="performance-segments">{segment.quarters.map(quarter => <div key={quarter.quarter} className="performance-bar-group">
      <div className="section-heading"><small>{quarterLabel(quarter.quarter)} · {quarter.periodEnd}</small><Source href={quarter.source}>분기 원문</Source></div>
      <div className="performance-bar-row"><span className="bar-fill" aria-hidden style={{ width: (quarter.amount / max * 100) + '%' }} /><strong>{amounts(quarter.amount, segment.currency)}</strong></div>
      {quarter.note && <small>{quarter.note}</small>}
    </div>)}</div>
  </article>
}
