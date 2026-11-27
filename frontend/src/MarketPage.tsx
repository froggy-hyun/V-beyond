import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import { ArrowDownUp, CalendarDays, ChartNoAxesCombined, ChevronRight, ScanSearch, Search, Star } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { categories, currency, pathFor, percent, tone, useData, useQuotes } from './api'
import type { Candle, Category, Quote, Stock } from './api'
import { Empty, ProductIcon, QuoteValue, StockMark, StockRow, Wait } from './ui'

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
  const [sort, setSort] = useState<Sort>('name')
  const [previewId, setPreviewId] = useState('')
  const navigate = useNavigate()
  const market = params.get('market') === 'US' ? 'US' : 'KR'
  const stocks = useData<Stock[]>('/stocks?market=' + market)
  const rows = stocks.data ?? []
  const quotes = new Map(useQuotes(rows.map(stock => stock.id)).map(quote => [quote.listingId, quote]))
  const rank = (stock: Stock) => {
    const quote = quotes.get(stock.id)
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
        {markets.map(([code, label]) => <button key={code} aria-pressed={market === code} onClick={() => {
          setPreviewId('')
          setParams(code === 'KR' ? {} : { market: code })
        }}>{label}주식</button>)}
      </div>
      <span className="market-feed">데모 시세</span>
    </div>
    <section className="market-highlights" aria-label="주요 종목">
      {highlights.map(stock => <Highlight key={stock.id} stock={stock} quote={quotes.get(stock.id)} />)}
    </section>

    <div className="dashboard">
      <section className="panel market-panel">
        <div className="section-heading market-list-heading">
          <h2>{market === 'KR' ? '국내' : '미국'} 종목 <span>{rows.length || ''}</span></h2>
          <label className="market-sort">
            <ArrowDownUp size={14} aria-hidden />
            <select aria-label="종목 정렬" value={sort} onChange={event => setSort(event.target.value as Sort)}>
              <option value="name">종목명순</option>
              <option value="change">상승률순</option>
              <option value="volume">거래량순</option>
            </select>
          </label>
        </div>
        <div className="market-columns" aria-hidden><span>종목명</span><span>현재가</span><span>등락률</span><span className="preview-column">차트</span></div>
        {stocks.data ? ordered.map(stock => <div className="market-list-row" key={stock.id}>
          <StockRow stock={stock} quote={quotes.get(stock.id)} />
          <button type="button" className="stock-preview-action" aria-label={stock.name + ' 차트 미리보기'} aria-pressed={preview?.id === stock.id} onClick={() => setPreviewId(stock.id)}>
            <ChartNoAxesCombined size={18} aria-hidden />
          </button>
        </div>) : <Wait error={stocks.error} />}
      </section>

      <aside className="market-aside">
        {desktop && preview && <Preview stock={preview} quote={quotes.get(preview.id)} />}
        <section className="panel market-shortcuts">
          <h2>상품에서 종목 찾기</h2>
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

function Highlight({ stock, quote }: { stock: Stock; quote?: Quote }) {
  return <Link className="market-highlight" to={pathFor(stock.id)}>
    <div className="highlight-label"><span>{stock.name}</span><small>{stock.symbol}</small></div>
    <QuoteValue quote={quote} />
  </Link>
}

function Preview({ stock, quote }: { stock: Stock; quote?: Quote }) {
  const candles = useData<Candle[]>('/market' + pathFor(stock.id) + '/candles?interval=5m&range=1D')
  const data = candles.data
  return <section className="panel market-preview" aria-label="종목 차트 미리보기">
    <div className="section-heading">
      <div className="preview-name"><StockMark stock={stock} /><div><h2>{stock.name}</h2><small>{stock.symbol} · {stock.exchange}</small></div></div>
      <Link className="plain-link" to={pathFor(stock.id)}>종목 상세 <ChevronRight size={15} aria-hidden /></Link>
    </div>
    {quote && <div className="preview-price">
      <strong>{currency(quote.price, quote.currency)}</strong>
      <span className={'change ' + tone(quote.changePercent)}>{percent(quote.changePercent)}</span>
    </div>}
    <div className="preview-chart">
      {data?.length ? <Suspense fallback={<Wait error={null} />}><Chart bars={data} market={stock.market} candle={false} /></Suspense>
        : data ? <Empty>표시할 시세가 없습니다.</Empty> : <Wait error={candles.error} />}
    </div>
  </section>
}
