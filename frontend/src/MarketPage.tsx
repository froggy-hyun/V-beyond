import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import { ArrowDownUp, CalendarDays, ChartNoAxesCombined, ChevronRight, ScanSearch, Search, Star } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { categories, currency, pathFor, percent, tone, useData, useMarketMode, useQuotes } from './api'
import type { Candle, Category, Quote, Stock } from './api'
import { Empty, ProductIcon, QuoteValue, Skeleton, StockMark, StockRow, Wait } from './ui'
import marketCharacter from './assets/brand/market.png'

const Chart = lazy(() => import('./Chart'))
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long',
})
const markets = [['KR', '국내'], ['US', '미국']] as const
const desktopWidth = window.matchMedia('(min-width: 840px)')
const subscribeToWidth = (update: () => void) => {
  desktopWidth.addEventListener('change', update)
  return () => desktopWidth.removeEventListener('change', update)
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
  const { quotes, getQuote } = useQuotes(rows.map(stock => stock.id))
  const delayed = quotes.some(quote => quote.freshness === 'STALE')
  const rank = (stock: Stock) => {
    const quote = getQuote(stock.id)
    return (sort === 'volume' ? quote?.cumulativeVolume : quote?.changePercent) ?? Number.NEGATIVE_INFINITY
  }
  const ordered = [...rows].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, 'ko')
    return sort === 'name' ? byName : rank(right) - rank(left) || byName
  })
  const preview = rows.find(stock => stock.id === previewId) ?? ordered[0]
  const highlights = rows.filter(stock => (market === 'KR' ? ['004370', '007310', '003230'] : ['KO', 'PEP', 'CPB']).includes(stock.symbol))
  const [search, setSearch] = useState('')

  return <div className="market-page">
    <header className="market-heading">
      <div>
        <p className="date"><CalendarDays size={15} aria-hidden /> {dateFormat.format(new Date())}</p>
        <h1>오늘의 주식시장</h1>
      </div>
      <form className="market-search" onSubmit={event => {
        event.preventDefault()
        const query = search.trim()
        navigate(query ? '/search?' + new URLSearchParams({ q: query }) : '/search')
      }}>
        <Search size={19} aria-hidden />
        <input aria-label="종목·브랜드 찾기" maxLength={100} placeholder="종목명, 티커, 브랜드 검색" value={search} onChange={event => setSearch(event.target.value)} />
      </form>
    </header>
    <div className="market-toolbar">
      <div className="market-tabs" role="group" aria-label="시장 선택">
        {markets.map(([code, label]) => <button key={code} aria-pressed={market === code} onClick={() => selectMarket(code)}>{label}주식</button>)}
      </div>
      <span className="market-feed">{mode === 'KIS_REST' ? delayed ? 'KIS 시세 · 갱신 지연' : '한국투자증권 시세' : mode === 'REPLAY' ? '데모 시세' : '시세 확인 중'}</span>
    </div>
    {stocks.isPending ? <Skeleton kind="highlights" label="주요 종목 불러오는 중" /> : <section className="market-highlights" aria-label="주요 종목">
      {highlights.map(stock => <Highlight key={stock.id} stock={stock} quote={getQuote(stock.id)} />)}
    </section>}

    <div className="dashboard">
      <section className="panel market-panel">
        <div className="section-heading market-list-heading">
          <h2>{market === 'KR' ? '국내' : '미국'} 종목 <span>{rows.length || ''}</span></h2>
          <div className="market-list-tools">
            <div className="density-toggle" role="group" aria-label="시세 표시 방식">
              <button aria-pressed={!detailed} onClick={() => selectView(false)}>간편</button>
              <button aria-pressed={detailed} onClick={() => selectView(true)}>상세</button>
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
        </div>) : <Wait error={stocks.error} />}
      </section>

      <aside className="market-aside">
        {desktop && preview && <Preview stock={preview} quote={getQuote(preview.id)} />}
        {desktop && stocks.isPending && <section className="panel market-preview"><Skeleton kind="chart" /></section>}
        <section className="panel market-shortcuts">
          <div className="shortcuts-heading"><h2>상품에서 종목 찾기</h2><img src={marketCharacter} alt="" width={350} height={275} /></div>
          <div className="category-list">
            {(Object.keys(categories) as Category[]).map(category => <Link key={category} to={'/ai?category=' + category}>
              <ProductIcon category={category} /><strong>{categories[category]}</strong>
            </Link>)}
          </div>
          <div className="market-shortcut-links">
            <Link to="/ai"><ScanSearch size={17} aria-hidden /> 자연어로 탐색 <ChevronRight size={15} aria-hidden /></Link>
            <Link to="/watchlist"><Star size={17} aria-hidden /> 관심종목 <ChevronRight size={15} aria-hidden /></Link>
          </div>
        </section>
      </aside>
    </div>
  </div>
}

function Highlight({ stock, quote }: { stock: Stock; quote?: Quote | null }) {
  return <Link className="market-highlight" to={pathFor(stock.id)}>
    <div className="highlight-label"><StockMark stock={stock} /><span>{stock.name}<small>{stock.symbol}</small></span></div>
    <QuoteValue quote={quote} />
  </Link>
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
