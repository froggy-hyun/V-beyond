import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ArrowDownUp, ChartNoAxesCombined, ChevronRight, Droplets, FlaskConical, LayoutGrid, Search, Shield } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { categories, currency, pathFor, percent, tone, useData, useMarketMode, useQuotes } from './api'
import type { Candle, Category, MarketIndex, Quote, Stock } from './api'
import { Empty, ProductIcon, QuoteValue, Skeleton, StockMark, StockRow, Wait } from './ui'
import marketCharacter from './assets/brand/market.png'

const Chart = lazy(() => import('./Chart'))
const markets = [['KR', '국내'], ['US', '미국']] as const
const ingredientShortcuts = [
  ['sodium-nitrite', '아질산나트륨', FlaskConical],
  ['aspartame', '아스파탐', Droplets],
  ['ptfe', 'PTFE', Shield],
] as const
const indexLabels = { KR: [['KOSPI', '코스피'], ['KOSDAQ', '코스닥']], US: [['SPX', 'S&P 500'], ['COMP', '나스닥 종합']] } as const
const indexFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const desktopWidth = window.matchMedia('(min-width: 840px)')
const subscribeToWidth = (update: () => void) => {
  desktopWidth.addEventListener('change', update)
  return () => desktopWidth.removeEventListener('change', update)
}

function MarketIndices({ market }: { market: keyof typeof indexLabels }) {
  const indices = useData<MarketIndex[]>('/market/indices?market=' + market, true, 12_000)
  return <section className="market-indices" aria-label={market === 'KR' ? '국내 시장 지수' : '미국 시장 지수'}>
    {indexLabels[market].map(([code, label]) => {
      const index = indices.data?.find(row => row.code === code)
      const direction = tone(index?.change ?? 0)
      return <div className={'index-cell ' + direction} key={code}>
        <div><h2>{label}</h2>{index ? <>
          <strong>{indexFormat.format(index.value)}</strong>
          <span className="index-change">{percent(index.changePercent)}</span>
        </> : indices.isPending ? <Skeleton kind="quote" label={`${label} 지수를 불러오고 있습니다`} /> : <span className="muted" aria-label={`${label} 지수를 불러오지 못했습니다`}>—</span>}</div>
        {index && <IndexSparkline label={label} points={index.points} />}
      </div>
    })}
  </section>
}

function IndexSparkline({ label, points }: { label: string; points: MarketIndex['points'] }) {
  if (points.length < 2) return null
  const lowest = Math.min(...points.map(point => point.value))
  const highest = Math.max(...points.map(point => point.value))
  const start = Date.parse(points[0].at)
  const span = Date.parse(points[points.length - 1].at) - start
  const coordinates = points.map((point, index) => {
    const x = 2 + 92 * (span > 0 ? (Date.parse(point.at) - start) / span : index / (points.length - 1))
    const y = 32 - 28 * (highest > lowest ? (point.value - lowest) / (highest - lowest) : .5)
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
  return <svg className="index-chart" viewBox="0 0 96 36" role="img" aria-label={`${label} 정규장 지수 그래프`}>
    <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
}
const isDesktop = () => desktopWidth.matches

type Sort = 'name' | 'volume' | 'change'

export default function MarketPage() {
  const [params, setParams] = useSearchParams()
  const desktop = useSyncExternalStore(subscribeToWidth, isDesktop)
  const mode = useMarketMode()
  const [sort, setSort] = useState<Sort>('name')
  const [previewId, setPreviewId] = useState('')
  const navigate = useNavigate()
  const market = params.get('market') === 'US' ? 'US' : 'KR'
  const detailed = params.get('view') === 'detail'
  const selectMarket = (code: string) => {
    setPreviewId('')
    const next = new URLSearchParams(params)
    if (code === 'US') next.set('market', code)
    else next.delete('market')
    setParams(next)
  }
  const selectView = (showDetails: boolean) => {
    const next = new URLSearchParams(params)
    if (showDetails) next.set('view', 'detail')
    else next.delete('view')
    setParams(next, { replace: true })
  }
  const stocks = useData<Stock[]>('/stocks?market=' + market)
  const rows = stocks.data ?? []
  const { getQuote } = useQuotes(rows.map(stock => stock.id))
  const rank = (stock: Stock) => {
    const quote = getQuote(stock.id)
    return (sort === 'volume' ? quote?.cumulativeVolume : quote?.changePercent) ?? Number.NEGATIVE_INFINITY
  }
  const ordered = [...rows].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, 'ko')
    return sort === 'name' ? byName : rank(right) - rank(left) || byName
  })
  const preview = rows.find(stock => stock.id === previewId) ?? ordered[0]
  const [search, setSearch] = useState('')

  return <div className="market-page">
    <header className="market-heading">
      <h1>주식</h1>
      <form className="market-search" onSubmit={event => {
        event.preventDefault()
        const query = search.trim()
        navigate(query ? '/search?' + new URLSearchParams({ q: query }) : '/search')
      }}>
        <Search size={19} aria-hidden />
        <input aria-label="종목·브랜드 찾기" maxLength={100} placeholder="종목명, 티커, 브랜드 검색" value={search} onChange={event => setSearch(event.target.value)} />
      </form>
    </header>
    {mode === 'KIS_REST' && <MarketIndices market={market} />}
    <div className="market-toolbar">
      <div className="market-tabs" role="group" aria-label="시장 선택">
        {markets.map(([code, label]) => <button key={code} aria-pressed={market === code} onClick={() => selectMarket(code)}>{label}주식</button>)}
      </div>
      {mode === 'REPLAY' && <span className="market-feed">시연용 시세입니다</span>}
    </div>

    <div className="dashboard">
      <section className="panel market-panel">
        <div className="section-heading market-list-heading">
          <h2>{market === 'KR' ? '국내' : '미국'} 종목 <span>{rows.length || ''}</span></h2>
          <div className="market-list-tools">
            <div className="density-toggle" role="group" aria-label="시세 표시 방식">
              <button aria-pressed={!detailed} onClick={() => selectView(false)}>간편</button>
              <button aria-pressed={detailed} onClick={() => selectView(true)}>프로</button>
            </div>
            <label className="market-sort">
              <ArrowDownUp size={14} aria-hidden />
              <select aria-label="종목 정렬" value={sort} onChange={event => setSort(event.target.value as Sort)}>
                <option value="name">종목명순</option>
                <option value="change">상승률순</option>
                <option value="volume">거래량순</option>
              </select>
            </label>
          </div>
        </div>
        <div className="market-columns" aria-hidden><span>종목명</span><span>현재가</span><span>등락률</span><span className="preview-column">차트</span></div>
        {stocks.data ? ordered.map(stock => <div className="market-list-row" key={stock.id}>
          <StockRow stock={stock} quote={getQuote(stock.id)} showVolume={detailed} />
          <button type="button" className="stock-preview-action" aria-label={stock.name + ' 차트 미리보기'} aria-pressed={preview?.id === stock.id} onClick={() => setPreviewId(stock.id)}>
            <ChartNoAxesCombined size={18} aria-hidden />
          </button>
        </div>) : stocks.error ? <Wait error={stocks.error} /> : <Skeleton kind="rows" label="종목 목록을 불러오고 있습니다" />}
      </section>

      <aside className="market-aside">
        {desktop && preview && <Preview stock={preview} quote={getQuote(preview.id)} />}
        {desktop && stocks.isPending && <section className="panel market-preview"><Skeleton kind="chart" /></section>}
        <MarketShortcuts headingId="market-stocks-heading" title="종목 찾기" to="/find-stocks">
          <Link to="/find-stocks"><span className="product-icon"><LayoutGrid aria-hidden strokeWidth={1.55} /></span><strong>상품군으로 종목 찾기</strong></Link>
          <Link to="/health"><span className="product-icon"><FlaskConical aria-hidden strokeWidth={1.55} /></span><strong>건강 이슈 성분으로 종목 찾기</strong></Link>
          {ingredientShortcuts.map(([id, name, Icon]) => <Link key={id} to={'/health?topic=' + id}>
            <span className="product-icon"><Icon aria-hidden strokeWidth={1.55} /></span><strong>{name}</strong>
          </Link>)}
        </MarketShortcuts>
        <MarketShortcuts headingId="market-products-heading" title="상품 찾기" to="/find-products">
          {(Object.keys(categories) as Category[]).map(category => <Link key={category} to={'/find-products?category=' + category}>
            <ProductIcon category={category} /><strong>{categories[category]}</strong>
          </Link>)}
        </MarketShortcuts>
        <Link to="/ai" className="market-natural-link">
          <img src={marketCharacter} alt="" width={350} height={275} />
          <strong>자연어로 탐색</strong><ChevronRight size={16} aria-hidden />
        </Link>
      </aside>
    </div>
  </div>
}

function MarketShortcuts({ headingId, title, to, children }: { headingId: string; title: string; to?: string; children: ReactNode }) {
  return <section className="panel market-shortcuts" aria-labelledby={headingId}>
    <h2 id={headingId}>{to ? <Link className="shortcut-heading-link" to={to}>{title}<ChevronRight size={17} aria-hidden /></Link> : title}</h2>
    <div className="category-list">{children}</div>
  </section>
}

function Preview({ stock, quote }: { stock: Stock; quote?: Quote | null }) {
  const live = useMarketMode() === 'KIS_REST'
  const candles = useData<Candle[]>('/market' + pathFor(stock.id) + '/candles?interval=5m&range=1D', true, live ? (quote?.session === 'REGULAR' ? 20_000 : 60_000) : undefined)
  const data = candles.data
  return <section className="panel market-preview" aria-label="종목 차트 미리보기">
    <div className="section-heading">
      <div className="preview-name"><StockMark stock={stock} /><div><h2>{stock.name}</h2><small>{stock.symbol} · {stock.exchange}</small></div></div>
      <Link className="plain-link" to={pathFor(stock.id)}>종목 상세 <ChevronRight size={15} aria-hidden /></Link>
    </div>
    {quote?.price != null ? <div className="preview-price">
      <strong>{currency(quote.price, quote.currency)}</strong>
      {quote.changePercent != null && <span className={'change ' + tone(quote.changePercent)}>{percent(quote.changePercent)}</span>}
    </div> : <div className="preview-price"><QuoteValue quote={quote} /></div>}
    <div className="preview-chart">
      {data?.length ? <Suspense fallback={<Skeleton kind="chart" />}><Chart key={stock.id} bars={data} market={stock.market} candle={false} /></Suspense>
        : data ? <Empty>표시할 시세가 없습니다.</Empty> : <Wait error={candles.error} kind="chart" />}
    </div>
  </section>
}
