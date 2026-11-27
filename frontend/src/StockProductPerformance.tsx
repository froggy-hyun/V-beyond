import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { pathFor, useData } from './api'
import type { Stock } from './api'
import { Empty, Source, Wait } from './ui'

type QuarterSales = { quarter: string; periodEnd: string; amount: number; source: string; note?: string }
type Segment = { name: string; scope: string; currency: string; quarters: QuarterSales[] }
type Brand = { name: string; stockId: string; amounts: (number | null)[] }
type Market = { name: string; scope: string; source: string; quarters: { quarter: string; total: number }[]; brands: Brand[] }
type Overview = { source: string; segments: Segment[]; markets: Market[] }

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 })
const quarterLabel = (value: string) => value.replace(/^FY\s*/, '회계 ').replace(/\s*Q([1-4])/, '년 $1분기')
const amounts = (amount: number | null | undefined, currency = 'KRW') => amount == null ? '자료 없음'
  : currency === 'KRW' ? number.format(amount / 100_000_000) + '억 원' : number.format(amount / 1_000_000) + '백만 달러'
const share = (amount: number, total: number) => total > 0 ? amount / total * 100 : 0
const revealThreshold = .4

export default function StockProductPerformance({ stock }: { stock: Stock }) {
  const result = useData<Overview>(pathFor(stock.id) + '/revenue-segments')
  return <section className="panel stock-wide" aria-labelledby="product-finance-heading">
    <header><h2 id="product-finance-heading">상품 매출 · 시장점유율</h2>
      <p>상품이 속한 브랜드의 소매 판매액과 공시 사업군 실적을 확인할 수 있습니다.</p></header>
    {result.data ? <>
      {result.data.markets.map(market => <RetailComparison key={market.name} market={market} stockId={stock.id} />)}
      {result.data.segments.map(segment => <ReportedSegment key={segment.name} segment={segment} />)}
      {!result.data.markets.length && !result.data.segments.length && <Empty>이 종목과 연결되는 상품 매출·점유율을 공개 자료에서 확인하지 못했습니다. <Source href={result.data.source}>기업 자료</Source></Empty>}
    </> : <Wait error={result.error} kind="products" />}
  </section>
}

function RetailComparison({ market, stockId }: { market: Market; stockId: string }) {
  const own = market.brands.find(brand => brand.stockId === stockId)
  const focus = own ?? market.brands[0]
  const choices = market.brands.filter(brand => brand.stockId !== focus.stockId)
  const [peerId, setPeerId] = useState(choices[0].stockId)
  const [index, setIndex] = useState(market.quarters.length - 1)
  const [metric, setMetric] = useState<'sales' | 'share'>('sales')
  const peer = choices.find(brand => brand.stockId === peerId) ?? choices[0]
  const quarter = market.quarters[index]
  const focusShare = share(focus.amounts[index] ?? 0, quarter.total)
  const peerShare = share(peer.amounts[index] ?? 0, quarter.total)
  const otherShare = Math.max(0, 100 - focusShare - peerShare)
  const measured = market.quarters.map((period, i) => {
    const values = [focus.amounts[i], peer.amounts[i]]
    return values.map(value => metric === 'share' && value != null ? share(value, period.total) : value)
  })
  const max = Math.max(1, ...measured.flat().map(value => value ?? 0))
  return <article className="performance-card" aria-label={market.name}>
    <div className="section-heading"><div><h3>{market.name}</h3><p>{market.scope}</p></div><Source href={market.source}>조사 원문</Source></div>
    {!own && <p>이 기업 브랜드의 판매액은 공개 표에서 확인되지 않아 시장의 다른 브랜드를 표시합니다.</p>}
    <div className="performance-controls">
      <label>비교 브랜드 <select value={peer.stockId} onChange={event => setPeerId(event.target.value)}>
        {choices.map(brand => <option key={brand.stockId} value={brand.stockId}>{brand.name}</option>)}</select></label>
      <label>시장점유율 분기 <select value={index} onChange={event => setIndex(Number(event.target.value))}>
        {market.quarters.map((period, i) => <option key={period.quarter} value={i}>{quarterLabel(period.quarter)}</option>)}</select></label>
    </div>
    <div className="performance-grid">
      <div className="performance-share">
        <h4>{quarterLabel(quarter.quarter)} 판매액 점유율</h4>
        <MarketShareChart total={quarter.total} focusShare={focusShare} peerShare={peerShare} />
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
        <div className="performance-bars" aria-label="분기별 두 브랜드 비교">
          {market.quarters.map((period, i) => <div className="performance-bar-group" key={period.quarter}>
            <small>{quarterLabel(period.quarter)}</small>
            {measured[i].map((value, j) => <div className="performance-bar-row" key={j}>
              <span className={j === 0 ? 'bar-fill' : 'bar-fill bar-peer'} aria-hidden style={{ width: ((value ?? 0) / max * 100) + '%' }} />
              <span><span className="sr-only">{j === 0 ? focus.name : peer.name} </span>{value == null ? '자료 없음' : metric === 'share' ? number.format(value) + '%' : amounts(value)}</span>
            </div>)}
          </div>)}
        </div>
      </div>
    </div>
    <p>판매액은 봉지와 용기를 합친 브랜드 집계입니다. 점유율은 공개된 소매 조사 전체 판매액을 기준으로 계산합니다.</p>
  </article>
}

function MarketShareChart({ total, focusShare, peerShare }: { total: number; focusShare: number; peerShare: number }) {
  const chart = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => !('IntersectionObserver' in window))
  useEffect(() => {
    if (!chart.current || visible) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= revealThreshold) setVisible(true)
    }, { threshold: revealThreshold })
    observer.observe(chart.current)
    return () => observer.disconnect()
  }, [visible])
  const slices = { '--focus-share': focusShare + '%', '--combined-share': (focusShare + peerShare) + '%' } as CSSProperties
  return <div ref={chart} className="performance-donut" data-visible={visible} style={slices}>
    <span><small>시장 전체</small><strong>{amounts(total)}</strong></span>
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
