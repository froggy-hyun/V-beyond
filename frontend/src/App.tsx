import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MarketPage from './MarketPage'
import StockHealthComparisons from './StockHealthComparisons'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ChartNoAxesCombined, ChevronLeft, ChevronRight, FlaskConical, GitCompareArrows, Heart, Home as HomeIcon, Menu, Search as SearchIcon, Sparkles, X } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, bases, categories, criteria, currency, formatFact, nutritionBasis, pathFor, percent, quoteStatus, quoteTime, relations, tone, useData, useMarketMode, useQuotes } from './api'
import type { Candle, Category, Comparison, Criterion, Fact, Match, Product, Stock } from './api'
import { Empty, ProductCard, ProductPhoto, productPhotoSource, Skeleton, Source, StockMark, StockRow, Wait } from './ui'
import wordmark from './assets/brand/wordmark.png'
import lockup from './assets/brand/lockup.png'
import watchlist from './assets/brand/watchlist.png'
import discovery from './assets/brand/discovery.png'

const Chart = lazy(() => import('./Chart'))

const defaultStock = 'KR:KOSPI:004370'
const stockTabs = [['price', '현재가'], ['chart', '차트'], ['company', '기업정보'], ['products', '판매상품']] as const
const chartRanges = [['1D', '1일'], ['1W', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['1Y', '1년']] as const
const prompts = ['나트륨이 낮은 라면', 'PTFE 없는 프라이팬', '당류가 낮은 콜라']

export default function App() {
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  const lastStock = readLastStock()
  const stockPath = location.pathname.startsWith('/stocks/') ? location.pathname : pathFor(lastStock)
  const links = [['/', '홈', HomeIcon], ['/watchlist', '관심', Heart], ['/search', '검색', SearchIcon],
    [stockPath + '?tab=price', '현재가', ChartNoAxesCombined], ['/menu', '메뉴', Menu]] as const
  return <>
    <header className="top"><div className="top-inner">
      <Link to="/" className="brand"><img src={wordmark} alt="V beyond" width={650} height={199} /></Link>
      <nav aria-label="주 메뉴">{links.map(([to, label, Icon]) =>
        <NavLink key={label} to={to} end>
          <Icon size={19} aria-hidden /><span>{label}</span>
        </NavLink>)}</nav>
      {location.pathname !== '/' && location.pathname !== '/search' && <div className="header-tools">
        <Link to="/search" className="header-search" aria-label="통합 검색"><SearchIcon size={21} aria-hidden /></Link>
      </div>}
    </div></header>
    <main className="shell">
      <div className="route-content" key={location.pathname}><Routes>
        <Route index element={<MarketPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="stocks/:id" element={<StockPage />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="products/:id/alternatives" element={<AlternativePage />} />
        <Route path="compare" element={<CompanyCompare />} />
        <Route path="ai" element={<Discovery />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="menu" element={<MenuPage stockPath={pathFor(lastStock) + '?tab=price'} />} />
        <Route path="*" element={<Empty>페이지를 찾을 수 없습니다. <Link to="/">시장으로</Link></Empty>} />
      </Routes></div>
      <footer><img src={lockup} alt="V beyond" width={626} height={282} /></footer>
    </main>
  </>
}

function readLastStock() {
  try { return localStorage.getItem('lens.lastStock') || defaultStock } catch { return defaultStock }
}

function MenuPage({ stockPath }: { stockPath: string }) {
  const groups = [
    ['주식', [[stockPath, '현재가', ChartNoAxesCombined], ['/watchlist', '관심종목', Heart], ['/search', '통합 검색', SearchIcon]]],
    ['상품', [['/ai', 'AI 상품 탐색', Sparkles], ['/compare', '기업 비교', GitCompareArrows]]],
  ] as const
  return <div className="page menu-page"><h1>전체 메뉴</h1>
    {groups.map(([group, items]) => <section className="panel menu-group" key={group} aria-label={group}>
      <h2>{group}</h2>{items.map(([to, label, Icon]) => <Link key={label} to={to}>
        <Icon size={20} aria-hidden /><span>{label}</span><ChevronRight size={16} aria-hidden />
      </Link>)}
    </section>)}
  </div>
}

const searchFilters = [['stocks', '종목'], ['products', '상품'], ['all', '전체']] as const

function SearchPage() {
  const [params, setParams] = useSearchParams()
  const term = params.get('q') ?? ''
  const filter = searchFilters.find(([value]) => value === params.get('type'))?.[0] ?? 'all'
  const rows = useData<{ stocks: Stock[]; products: Product[] }>('/search?q=' + encodeURIComponent(term), term.trim().length > 0)
  const results = rows.data
  const { getQuote } = useQuotes(filter === 'products' ? [] : (results?.stocks ?? []).map(stock => stock.id))
  const editQuery = (q: string) => {
    const next = new URLSearchParams(params)
    if (q) next.set('q', q)
    else next.delete('q')
    setParams(next, { replace: true })
  }
  return <div className="page search-page"><h1>통합 검색</h1>
    <div className="search-header"><Link to="/" className="icon-btn" aria-label="홈으로"><ChevronLeft size={23} aria-hidden /></Link>
      <div className="search-field"><SearchIcon size={18} aria-hidden /><input aria-label="기업·상품 검색" autoFocus value={term} maxLength={100} placeholder="종목명, 티커, 상품명 검색" onChange={event => editQuery(event.target.value)} />
        {term && <button type="button" aria-label="검색어 지우기" onClick={() => editQuery('')}><X size={17} aria-hidden /></button>}
      </div>
    </div>
    {term.trim() && <div className="search-tabs" role="group" aria-label="검색 결과 분류">
      {searchFilters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => {
        const next = new URLSearchParams(params)
        if (value === 'all') next.delete('type')
        else next.set('type', value)
        setParams(next, { replace: true })
      }}>{label}{value !== 'all' && results ? <span>{results[value].length}</span> : null}</button>)}
    </div>}
    {!term.trim() ? <div className="tags">{['농심', 'Calphalon', 'CPB', '펩시'].map(example => <button key={example} onClick={() => editQuery(example)}>{example}</button>)}</div>
      : results ? <>
        {filter !== 'products' && <section className="panel search-result"><h2 className="sr-only">종목</h2>{results.stocks.length
          ? ([['KR', '국내주식'], ['US', '미국주식']] as const).map(([market, label]) => {
            const localStocks = results.stocks.filter(stock => stock.market === market)
            return localStocks.length > 0 && <div className="search-group" key={market}>
              <h3>{label}</h3>{localStocks.map(stock => <StockRow key={stock.id} stock={stock} quote={getQuote(stock.id)} />)}
            </div>
          })
          : <Empty>검색된 종목이 없습니다.</Empty>}</section>}
        {filter !== 'stocks' && <section className="panel search-result"><h2>상품</h2>{results.products.length
          ? <div className="products">{results.products.map(product => <ProductCard key={product.id} product={product} />)}</div>
          : <Empty>검색된 상품이 없습니다.</Empty>}</section>}
      </> : <Wait error={rows.error} kind={filter === 'products' ? 'products' : 'rows'} />}
  </div>
}

function readWatchlist(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('lens.watchlist') ?? '[]')
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 10) : []
  } catch { return [] }
}

function StockPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const stock = useData<Stock>(pathFor(id))
  const products = useData<Product[]>(pathFor(id) + '/products')
  const mode = useMarketMode()
  const quote = useQuotes([id]).getQuote(id)
  const time = quote ? quoteTime(quote) : null
  const tab = stockTabs.find(([value]) => value === params.get('tab'))?.[0] ?? 'chart'
  const setControl = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.set(key, value)
    return next
  }, { replace: true })
  const range = chartRanges.find(([value]) => value === params.get('range'))?.[0] ?? '1D'
  const interval = range !== '1D' ? '1d' : params.get('interval') === '5m' ? '5m' : '1m'
  const bars = useData<Candle[]>('/market' + pathFor(id) + '/candles?interval=' + interval + '&range=' + range, tab === 'chart', mode === 'KIS_REST' ? (range === '1D' && quote?.session === 'REGULAR' ? 16_000 : 60_000) : undefined)
  const lastBar = bars.data?.at(-1)
  const [watch, setWatch] = useState(readWatchlist)
  useEffect(() => {
    if (!stock.data) return
    try { localStorage.setItem('lens.lastStock', stock.data.id) } catch { /* 저장이 제한된 브라우저에서도 화면은 유지 */ }
  }, [stock.data])
  const toggle = () => {
    const next = watch.includes(id) ? watch.filter(entry => entry !== id) : [...watch, id]
    localStorage.setItem('lens.watchlist', JSON.stringify(next))
    setWatch(next)
  }
  if (!stock.data) return <div className="page"><section className="panel"><Wait error={stock.error} kind="stock" /></section></div>
  const info = stock.data
  const quoteTimeLabel = time && new Date(time).toLocaleString('ko-KR', { timeZone: quote?.exchangeTimestamp && info.market === 'US' ? 'America/New_York' : 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const companySection = <section className="panel stock-company"><div className="section-heading"><h2>기업 소개</h2><Source href={info.source}>기업 웹사이트</Source></div><p>{info.overview}</p></section>
  const productSection = <section className="panel stock-products"><div className="section-heading"><h2>판매 상품</h2><Link className="plain-link" to={'/compare?first=' + encodeURIComponent(id)}>기업 비교 <ChevronRight size={15} aria-hidden /></Link></div>
    {products.data ? <div className="products">{products.data.map(product => <ProductCard key={product.id} product={product} />)}</div> : <Wait error={products.error} kind="products" />}</section>
  return <div className="page stock-page">
    <section className="stock-summary"><div className="section-heading"><div className="stock-title">
      <Link className="icon-btn stock-back" to={'/?market=' + info.market} aria-label="주식 목록으로"><ChevronLeft size={25} aria-hidden /></Link>
      <StockMark stock={info} /><div><h1>{info.name}</h1><p>{info.symbol} · {info.exchange}</p></div></div>
      <button aria-label="관심종목" aria-pressed={watch.includes(id)} className="icon-btn" onClick={toggle}><Heart size={23} fill={watch.includes(id) ? 'currentColor' : 'none'} aria-hidden /></button></div>
      {quote?.price != null
        ? <div className="detail-price"><strong>{currency(quote.price, quote.currency)}</strong>{quote.changePercent != null && <span className={'change ' + tone(quote.changePercent)}>{percent(quote.changePercent)}</span>}<span className="status">{quoteStatus(quote)}</span></div>
        : quote === undefined ? <div className="detail-price"><Skeleton kind="quote" label="시세를 불러오고 있습니다" /></div> : <Empty>시세를 불러오지 못했습니다.</Empty>}
      {quoteTimeLabel && <p className="quote-meta">{quoteTimeLabel} {quote?.exchangeTimestamp ? '기준' : '조회'}</p>}
      <div className="search-tabs stock-tabs" role="group" aria-label="종목 상세 탭">{stockTabs.map(([value, label]) =>
        <button key={value} aria-pressed={tab === value} onClick={() => setControl('tab', value)}>{label}</button>)}</div>
    </section>

    {tab === 'price' && <section className="panel stock-detail"><h2>시세 정보</h2>
      {quote?.price != null ? <dl className="fact-list">
        <div className="fact-row"><dt>현재가</dt><dd>{currency(quote.price, quote.currency)}</dd></div>
        {quote.change != null && <div className="fact-row"><dt>전일 대비</dt><dd>{currency(quote.change, quote.currency)}</dd></div>}
        <div className="fact-row"><dt>거래량</dt><dd>{quote.cumulativeVolume.toLocaleString('ko-KR')}</dd></div>
      </dl> : quote === undefined ? <Skeleton kind="rows" /> : <Empty>시세를 불러오지 못했습니다.</Empty>}
    </section>}
    {tab === 'company' && companySection}
    {tab === 'products' && productSection}
    {tab === 'chart' && <div className="stock-main"><section className="panel stock-detail">
      <div className="chart-controls">
        <div className="segmented" role="group" aria-label="차트 조회 구간">{chartRanges.map(([value, label]) => <button className={range === value ? 'selected' : ''} aria-pressed={range === value} key={value} onClick={() => setControl('range', value)}>{label}</button>)}</div>
        {range === '1D' && <div className="segmented" role="group" aria-label="차트 표시 방식">{[['line', '선'], ['1m', '1분 봉'], ['5m', '5분 봉']].map(([value, label]) => <button key={value} className={(params.get('interval') ?? 'line') === value ? 'selected' : ''} aria-pressed={(params.get('interval') ?? 'line') === value} onClick={() => setControl('interval', value)}>{label}</button>)}</div>}
      </div>
      {mode === 'KIS_REST' && lastBar ? <p className="chart-session">
        {range === '1D' ? '정규장' : '기간 일봉'} · 마지막 봉 {new Date(lastBar.startAt).toLocaleString('ko-KR', {
          timeZone: range !== '1D' ? 'UTC' : info.market === 'KR' ? 'Asia/Seoul' : 'America/New_York',
          month: 'numeric', day: 'numeric', ...(range === '1D' ? { hour: '2-digit', minute: '2-digit' } as const : {}),
        })}
      </p> : null}
      {bars.data?.length ? <Suspense fallback={<Skeleton kind="chart" />}><Chart key={id + range + interval} bars={bars.data} market={info.market} daily={range !== '1D'} candle={range !== '1D' || ['1m', '5m'].includes(params.get('interval') ?? '')} /></Suspense> : bars.data ? <Empty>표시할 시세가 없습니다.</Empty> : <Wait error={bars.error} kind="chart" />}
      {lastBar && <dl className="last-bar-summary" aria-label="마지막 봉 가격">
        {([['시가', lastBar.open], ['고가', lastBar.high], ['저가', lastBar.low], ['종가', lastBar.close]] as const).map(([label, price]) =>
          <div key={label}><dt>{label}</dt><dd>{currency(price, info.currency)}</dd></div>)}
      </dl>}
    </section><StockHealthComparisons stock={info} /></div>}
    {(tab === 'chart' || tab === 'price') && <aside className="stock-side" aria-label="기업과 판매 상품">{companySection}{productSection}</aside>}
  </div>
}

function ProductPage() {
  const { id = '' } = useParams()
  const product = useData<Product>('/products/' + id)
  const owner = useData<Stock[]>('/stocks?market=' + (product.data?.market ?? ''), Boolean(product.data))
  if (!product.data) return <div className="page"><section className="panel"><Wait error={product.error} kind="product" /></section></div>
  const item = product.data
  const company = owner.data?.find(stock => stock.symbol === item.symbol)
  const photoSource = productPhotoSource(item.id)
  return <div className="page">
    {company && <Link className="back" to={pathFor(company.id)}><ArrowLeft size={16} /> {company.name}</Link>}
    <section className="panel product-heading"><ProductPhoto product={item} detail /><div><p className="eyebrow">{categories[item.category]} · {item.market === 'KR' ? '국내' : '미국'}</p><h1>{item.name}</h1><p>{item.brand} · {relations[item.relation]} · {item.size}</p>{photoSource && <Source href={photoSource}>사진 출처</Source>}</div></section>
    <section className="panel"><div className="section-heading"><h2>영양·소재 정보</h2><Source href={item.source}>제품 출처</Source></div><p>{item.description}</p><p className="muted">{item.prep}</p>
      {item.material && <div className="fact-row"><strong>공개 사양</strong><span>{item.material}</span></div>}
      {item.facts.map(fact => <div className="fact-row" key={fact.criterion + fact.basis}><div><strong>{criteria[fact.criterion]}</strong><small>{bases[fact.basis]}</small></div><strong>{formatFact(fact)}</strong><Source href={fact.source} /></div>)}
      <Link className="primary" to={'/products/' + item.id + '/alternatives'}>대안 상품 탐색</Link>
    </section>
    <section className="panel"><h2>건강 관련 근거</h2>{item.evidence.length ? item.evidence.map(evidence =>
      <article className="evidence" key={evidence.title}><FlaskConical size={19} /><div><h3>{evidence.title}</h3><p>{evidence.summary}</p><Source href={evidence.source} /></div></article>) : <Empty>이 상품에 연결된 근거가 없습니다.</Empty>}</section>
  </div>
}

function AlternativePage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const origin = useData<Product>('/products/' + id)
  const item = origin.data
  const defaultCriterion = item?.category === 'FRYING_PAN' ? 'AVOID_PTFE' : item?.category === 'COLA' ? 'TOTAL_SUGAR'
    : item?.category === 'CHOCOLATE' || item?.category === 'PEANUT_BUTTER' ? 'ADDED_SUGAR' : 'SODIUM'
  const criterion = (params.get('criterion') || defaultCriterion) as Criterion
  const scope = params.get('scope') || 'OTHER_COMPANY'
  const basis = item && !criterion.startsWith('AVOID_') ? nutritionBasis(item.category) : ''
  const result = useData<{ baseline: Fact | null; matches: Match[]; excluded: number }>(
    '/products/' + id + '/alternatives?' + new URLSearchParams({ criterion, basis, scope }), Boolean(item))
  const { getQuote } = useQuotes([...new Set(result.data?.matches.map(row => row.stock.id) ?? [])])
  if (!item) return <div className="page"><section className="panel"><Wait error={origin.error} kind="product" /></section></div>
  return <div className="page"><Link className="back" to={'/products/' + item.id}><ArrowLeft size={16} /> {item.name}</Link><h1>대안 상품 탐색</h1>
    <section className="panel"><div className="section-heading"><div><h2>{item.name}</h2><p>{item.prep}</p></div><ProductPhoto product={item} /></div>
      <div className="fields"><label>비교 기준<select value={criterion} onChange={event => setParams({ criterion: event.target.value, scope })}>{Object.entries(criteria).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>기업 관계<select value={scope} onChange={event => setParams({ criterion, scope: event.target.value })}><option value="OTHER_COMPANY">다른 기업</option><option value="SAME_COMPANY">같은 기업</option><option value="ALL_COMPANIES">전체</option></select></label></div>
      {result.data?.baseline && <p className="baseline">기준 상품 {formatFact(result.data.baseline)} · {bases[result.data.baseline.basis]}</p>}
    </section>
    <section className="panel"><h2>비교 결과</h2>{result.data ? <>
      {result.data.matches.length ? result.data.matches.map(match =>
        <div className="match" key={match.product.id}><ProductCard product={match.product} /><div className="match-meta"><strong>{formatFact(match.fact)} {match.reductionPercent != null && <span className="status">{match.reductionPercent}% 낮음</span>}</strong><Source href={match.fact.source} /></div>
          <StockRow stock={match.stock} quote={getQuote(match.stock.id)} /></div>) : <Empty>동일 기준으로 확인된 대안 상품이 없습니다.</Empty>}
      {result.data.excluded > 0 && <p className="muted">비교 기준이 다르거나 조건에 맞지 않는 상품은 결과에서 제외했습니다.</p>}
    </> : <Wait error={result.error} kind="products" />}</section>
  </div>
}

function CompanyCompare() {
  const [params, setParams] = useSearchParams()
  const stocks = useData<Stock[]>('/stocks')
  const first = params.get('first') ?? ''
  const second = params.get('second') ?? ''
  const result = useData<Comparison[]>('/comparisons/companies?ids=' + [first, second].map(encodeURIComponent).join(','), Boolean(first && second && first !== second))
  return <div className="page"><h1>기업 비교</h1>
    <section className="panel"><div className="fields">{(['first', 'second'] as const).map((key, index) =>
      <label key={key}>{index === 0 ? '첫 번째 기업' : '두 번째 기업'}<select disabled={stocks.isPending} value={key === 'first' ? first : second} onChange={event => {
        const next = new URLSearchParams(params)
        next.set(key, event.target.value)
        setParams(next)
      }}><option value="">기업을 선택해 주세요</option>{stocks.data?.map(stock => <option key={stock.id} value={stock.id} disabled={stock.id === (key === 'first' ? second : first)}>{stock.name} · {stock.symbol}</option>)}</select></label>)}</div>
      {stocks.isPending || stocks.error ? <Wait error={stocks.error} /> : null}
    </section>
    {result.data ? <><div className="compare-grid">{result.data.map(row => <section key={row.stock.id} className="panel"><Link className="plain-link" to={pathFor(row.stock.id)}><h2>{row.stock.name}</h2></Link>
      <p>{row.stock.overview}</p>{row.products.map(product => <article key={product.id} className="compare-product"><ProductCard product={product} />
        <p className="muted">{product.prep}</p>{product.facts.filter(fact => fact.basis !== 'PER_100ML').slice(0, 4).map(fact => <div className="fact-row" key={fact.criterion}><span>{criteria[fact.criterion]}</span><strong>{formatFact(fact)}</strong><Source href={fact.source} /></div>)}
        {product.material && <p>{product.material}</p>}</article>)}<Source href={row.stock.source}>기업 출처</Source></section>)}</div>
      <p className="muted">공개 자료를 확인할 수 있는 상품을 비교합니다.</p></> : result.isFetching || result.error ? <Wait error={result.error} kind="products" /> : <Empty>비교할 기업 두 곳을 선택해 주세요.</Empty>}
  </div>
}

type DiscoverResult = { filters: { category: Category; criterion: Criterion } | null; results: Match[]; method: string; message: string }
function Discovery() {
  const [params, setParams] = useSearchParams()
  const [question, setQuestion] = useState('')
  const category = params.get('category') ?? ''
  const criterion = params.get('criterion') ?? ''
  const natural = useMutation({ mutationFn: (value: string) => api<DiscoverResult>('/ai/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value }) }) })
  const manual = useData<DiscoverResult>('/ai/discover?' + new URLSearchParams({ category, criterion }), Boolean(category && criterion))
  const run = (value: string) => { setQuestion(value); setParams({}); natural.mutate(value) }
  const submit = (event: FormEvent) => { event.preventDefault(); if (question.trim()) run(question) }
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (natural.data?.filters) for (const [name, entry] of Object.entries(natural.data.filters)) if (!next.has(name)) next.set(name, entry)
    next.set(key, value)
    natural.reset()
    setParams(next)
  }
  const result = natural.data ?? manual.data
  return <div className="page"><div className="discovery-heading"><h1>AI 상품 탐색</h1><img src={discovery} alt="" width={217} height={278} /></div>
    <section className="panel"><form className="ask" onSubmit={submit}><label htmlFor="question">어떤 상품을 찾고 있나요?</label>
      <textarea id="question" rows={3} value={question} maxLength={240} placeholder="예: 나트륨이 낮은 라면을 찾고 싶어요." onChange={event => setQuestion(event.target.value)} />
      <div className="tags">{prompts.map(prompt => <button type="button" key={prompt} disabled={natural.isPending} onClick={() => run(prompt)}>{prompt}</button>)}</div>
      <button className="primary" disabled={natural.isPending || !question.trim()} type="submit"><Sparkles size={17} /> {natural.isPending ? '상품을 찾고 있습니다…' : '상품 찾아보기'}</button></form></section>
    <section className="panel"><h2>탐색 조건</h2><div className="fields"><label>상품군<select value={category || result?.filters?.category || ''} onChange={event => filter('category', event.target.value)}>
      <option value="">상품군 선택</option>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>비교 기준<select value={criterion || result?.filters?.criterion || ''} onChange={event => filter('criterion', event.target.value)}>
      <option value="">비교 기준 선택</option>{Object.entries(criteria).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
      {natural.error && <Empty>{natural.error.message} 조건을 직접 선택해 다시 찾아보실 수 있습니다.</Empty>}
    </section>
    {(natural.isPending || (manual.isFetching && !result)) && <section className="panel"><h2>탐색 결과</h2><Skeleton kind="products" label="상품을 찾고 있습니다" /></section>}
    {manual.error && !natural.data && <section className="panel"><Wait error={manual.error} /></section>}
    {result && <section className="panel discovery-result"><h2>탐색 결과</h2><p>{result.message}</p>{result.results.map(row => <article className="match" key={row.product.id}>
      <ProductCard product={row.product} /><div className="match-meta"><strong>{formatFact(row.fact)} · {bases[row.fact.basis]}</strong><Source href={row.fact.source} /></div>
      <Link className="plain-link" to={pathFor(row.stock.id)}>{row.stock.name} · {row.stock.symbol}</Link></article>)}</section>}
  </div>
}

function Watchlist() {
  const stocks = useData<Stock[]>('/stocks')
  const ids = readWatchlist()
  const { getQuote } = useQuotes(ids)
  const watched = stocks.data?.filter(stock => ids.includes(stock.id))
  return <div className="page watchlist-page"><h1>관심종목</h1><section className="panel watchlist-table">{watched ? watched.length
    ? <><div className="market-columns" aria-hidden><span>종목명</span><span>현재가</span><span>등락률</span></div>
      {watched.map(stock => <StockRow key={stock.id} stock={stock} quote={getQuote(stock.id)} />)}</>
    : <div className="watchlist-empty"><img src={watchlist} alt="" width={404} height={295} /><Empty>아직 담아둔 관심종목이 없습니다. <Link to="/">종목 둘러보기</Link></Empty></div>
    : <Wait error={stocks.error} />}</section></div>
}
