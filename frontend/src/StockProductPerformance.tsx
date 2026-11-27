import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { pathFor, useData } from './api'
import type { Stock } from './api'
import { Source, Wait } from './ui'

type QuarterSales = { quarter: string; periodEnd: string; amount: number; source: string; note?: string }
type Segment = { name: string; scope: string; currency: string; quarters: QuarterSales[] }
type Brand = { name: string; stockId: string; amounts: (number | null)[] }
type Market = { name: string; scope: string; source: string; quarters: { quarter: string; total: number }[]; brands: Brand[] }
type Overview = { source: string; segments: Segment[]; markets: Market[] }

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
const quarterLabel = (value: string) => value.replace(/^FY\s*/, '회계 ').replace(/\s*Q([1-4])/, '년 $1분기')
const amounts = (amount: number, currency = 'KRW') => currency === 'KRW'
  ? number.format(amount / 100_000_000) + '억 원' : number.format(amount / 1_000_000) + '백만 달러'
const share = (amount: number, total: number) => total > 0 ? amount / total * 100 : 0
const sharedPeriods = (market: Market, focus: Brand, peer: Brand) => market.quarters.flatMap((period, index) => {
  const focusAmount = focus.amounts[index]
  const peerAmount = peer.amounts[index]
  return period.total > 0 && focusAmount != null && peerAmount != null ? [{ ...period, focusAmount, peerAmount }] : []
})

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
    const focus = market.brands.find(brand => brand.stockId === stock.id)
    if (!focus) return []
    const choices = market.brands.filter(brand => brand.stockId !== stock.id && sharedPeriods(market, focus, brand).length > 0)
    return choices.length > 0 ? [{ market, focus, choices }] : []
  })
  if (result.data && !markets?.length && !result.data.segments.length) return null
  return <section className="panel stock-wide" aria-labelledby="product-finance-heading">
    <header><h2 id="product-finance-heading">상품 매출 · 시장점유율</h2>
      <p>상품이 속한 브랜드의 소매 판매액과 공시 사업군 실적을 확인할 수 있습니다.</p></header>
    {result.data ? <>
      {markets?.map(({ market, focus, choices }) => <RetailComparison key={market.name} market={market} focus={focus} choices={choices} />)}
      {result.data.segments.map(segment => <ReportedSegment key={segment.name} segment={segment} />)}
    </> : <Wait error={result.error} kind="products" />}
  </section>
}

function RetailComparison({ market, focus, choices }: { market: Market; focus: Brand; choices: Brand[] }) {
  const [peerId, setPeerId] = useState(choices[0].stockId)
  const [selectedQuarter, setSelectedQuarter] = useState('')
  const [metric, setMetric] = useState<'sales' | 'share'>('sales')
  const [donut, donutInView] = useChartReveal(.4)
  const [trend, revealTrend] = useChartReveal(.25)
  const [donutFinished, setDonutFinished] = useState(false)
  const revealDonut = donutInView || revealTrend
  const peer = choices.find(brand => brand.stockId === peerId) ?? choices[0]
  const periods = sharedPeriods(market, focus, peer)
  const quarter = periods.find(period => period.quarter === selectedQuarter) ?? periods[periods.length - 1]
  const focusShare = share(quarter.focusAmount, quarter.total)
  const peerShare = share(quarter.peerAmount, quarter.total)
  const otherShare = Math.max(0, 100 - focusShare - peerShare)
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
  }, [donut, revealDonut, donutFinished, focusShare, peerShare])
  const slices = { '--focus-share': focusShare + '%', '--combined-share': (focusShare + peerShare) + '%' } as CSSProperties
  const measured = periods.map(period => [period.focusAmount, period.peerAmount]
    .map(value => metric === 'share' ? share(value, period.total) : value))
  const max = Math.max(1, ...measured.flat())
  return <article className="performance-card" aria-label={market.name}>
    <div className="section-heading"><div><h3>{market.name}</h3><p>{market.scope}</p></div><Source href={market.source}>조사 원문</Source></div>
    <div className="performance-controls">
      <label>비교 브랜드 <select value={peer.stockId} onChange={event => setPeerId(event.target.value)}>
        {choices.map(brand => <option key={brand.stockId} value={brand.stockId}>{brand.name}</option>)}</select></label>
      <label>시장점유율 분기 <select value={quarter.quarter} onChange={event => setSelectedQuarter(event.target.value)}>
        {periods.map(period => <option key={period.quarter} value={period.quarter}>{quarterLabel(period.quarter)}</option>)}</select></label>
    </div>
    <div className="performance-grid">
      <div className="performance-share">
        <h4>{quarterLabel(quarter.quarter)} 판매액 점유율</h4>
        <div ref={donut} className="performance-donut" data-visible={revealDonut} style={slices}>
          <span><small>시장 전체</small><strong>{amounts(quarter.total)}</strong></span>
        </div>
        <dl className="performance-legend">
          <div><dt><Link to={pathFor(focus.stockId)}>{focus.name}</Link></dt><dd>{number.format(focusShare)}%</dd></div>
          <div><dt><Link to={pathFor(peer.stockId)}>{peer.name}</Link></dt><dd>{number.format(peerShare)}%</dd></div>
          <div><dt>기타 브랜드</dt><dd>{number.format(otherShare)}%</dd></div>
        </dl>
      </div>
      <div>
        <div className="section-heading"><h4>분기별 브랜드 추이</h4><div className="segmented" role="group" aria-label="브랜드 추이 지표">
          <button aria-pressed={metric === 'sales'} className={metric === 'sales' ? 'selected' : ''} onClick={() => setMetric('sales')}>판매액</button>
          <button aria-pressed={metric === 'share'} className={metric === 'share' ? 'selected' : ''} onClick={() => setMetric('share')}>점유율</button>
        </div></div>
        <div ref={trend} className="performance-bars" aria-label="분기별 두 브랜드 비교" data-visible={donutFinished && revealTrend}>
          {periods.map((period, i) => <div className="performance-bar-group" key={period.quarter}>
            <small>{quarterLabel(period.quarter)}</small>
            {measured[i].map((value, j) => <div className="performance-bar-row" key={j}>
              <span className={j === 0 ? 'bar-fill' : 'bar-fill bar-peer'} aria-hidden style={{
                '--bar-width': (value / max * 100) + '%', '--bar-delay': (i * 65 + j * 25) + 'ms',
              } as CSSProperties} />
              <span><span className="sr-only">{j === 0 ? focus.name : peer.name} </span>{metric === 'share' ? number.format(value) + '%' : amounts(value)}</span>
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
    <p>판매액은 봉지와 용기를 합친 브랜드 집계입니다. 점유율은 공개된 소매 조사 전체 판매액을 기준으로 계산합니다.</p>
  </article>
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
