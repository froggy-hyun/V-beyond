import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import MarketPage from './MarketPage'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, FlaskConical, Home as HomeIcon, Search as SearchIcon, Sparkles, Star, GitCompareArrows } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, bases, categories, criteria, currency, formatFact, pathFor, percent, quoteStatus, quoteTime, relations, tone, useData, useMarketMode, useQuotes } from './api'
import type { Candle, Category, Comparison, Criterion, Fact, Match, Product, Stock } from './api'
import { Empty, ProductCard, ProductPhoto, productPhotoSource, Skeleton, Source, StockMark, StockRow, Wait } from './ui'
import wordmark from './assets/brand/wordmark.png'
import lockup from './assets/brand/lockup.png'
import watchlist from './assets/brand/watchlist.png'
import discovery from './assets/brand/discovery.png'

const Chart = lazy(() => import('./Chart'))

const links = [['/', '시장', HomeIcon], ['/search', '검색', SearchIcon], ['/ai', 'AI 탐색', Sparkles],
  ['/compare', '기업 비교', GitCompareArrows], ['/watchlist', '관심종목', Star]] as const
const chartRanges = [['1D', '1일'], ['1W', '1주'], ['1M', '1개월'], ['3M', '3개월'], ['1Y', '1년']] as const
const prompts = ['나트륨이 낮은 라면', 'PTFE 없는 프라이팬', '당류가 낮은 콜라']

export default function App() {
  const mode = useMarketMode()
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  return <>
    <header className="top"><div className="top-inner">
      <Link to="/" className="brand"><img src={wordmark} alt="V beyond" width={650} height={199} /></Link>
      <nav aria-label="주 메뉴">{links.map(([to, label, Icon]) =>
        <NavLink key={to} to={to} end><Icon size={17} aria-hidden /><span>{label}</span></NavLink>)}</nav>
      <span className="demo">비공식 서비스</span>
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
        <Route path="*" element={<Empty>페이지를 찾을 수 없습니다. <Link to="/">시장으로</Link></Empty>} />
      </Routes></div>
      <footer><img src={lockup} alt="V beyond" width={626} height={282} /><span>{mode === 'KIS_REST' ? '시세 제공: 한국투자증권' : mode === 'REPLAY' ? '시세는 시연용 데이터입니다.' : ''}</span></footer>
    </main>
  </>
}

const searchFilters = [['all', '전체'], ['stocks', '종목'], ['products', '상품']] as const

function SearchPage() {
  const [params, setParams] = useSearchParams()
  const term = params.get('q') ?? ''
  const filter = searchFilters.find(([value]) => value === params.get('type'))?.[0] ?? 'all'
  const rows = useData<{ stocks: Stock[]; products: Product[] }>('/search?q=' + encodeURIComponent(term), term.trim().length > 0)
  const { getQuote } = useQuotes(filter === 'products' ? [] : (rows.data?.stocks ?? []).map(stock => stock.id))
  const editQuery = (q: string) => {
    const next = new URLSearchParams(params)
    if (q) next.set('q', q)
    else next.delete('q')
    setParams(next, { replace: true })
  }
  return <div className="page search-page"><h1>통합 검색</h1>
    <label className="search-field"><SearchIcon size={20} /><input aria-label="기업·상품 검색" autoFocus value={term} maxLength={100} placeholder="기업명, 티커, 브랜드 또는 상품명" onChange={event => editQuery(event.target.value)} /></label>
    {term.trim() && <div className="search-tabs" role="group" aria-label="검색 결과 분류">
      {searchFilters.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => {
        const next = new URLSearchParams(params)
        if (value === 'all') next.delete('type')
        else next.set('type', value)
        setParams(next, { replace: true })
      }}>{label}{value !== 'all' && rows.data ? <span>{rows.data[value].length}</span> : null}</button>)}
    </div>}
    {!term.trim() ? <div className="tags">{['농심', 'Calphalon', 'CPB', '펩시'].map(example => <button key={example} onClick={() => editQuery(example)}>{example}</button>)}</div>
      : rows.data ? <>
        {filter !== 'products' && <section className="panel search-result"><h2>종목</h2>{rows.data.stocks.length
          ? rows.data.stocks.map(stock => <StockRow key={stock.id} stock={stock} quote={getQuote(stock.id)} />)
          : <Empty>검색된 종목이 없습니다.</Empty>}</section>}
        {filter !== 'stocks' && <section className="panel search-result"><h2>상품</h2>{rows.data.products.length
          ? <div className="products">{rows.data.products.map(product => <ProductCard key={product.id} product={product} />)}</div>
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
  const range = chartRanges.find(([value]) => value === params.get('range'))?.[0] ?? '1D'
  const interval = range !== '1D' ? '1d' : params.get('interval') === '5m' ? '5m' : '1m'
  const bars = useData<Candle[]>('/market' + pathFor(id) + '/candles?interval=' + interval + '&range=' + range, true, mode === 'KIS_REST' ? (range === '1D' && quote?.session === 'REGULAR' ? 16_000 : 60_000) : undefined)
  const lastBar = bars.data?.at(-1)
  const [watch, setWatch] = useState(readWatchlist)
  const toggle = () => {
    const next = watch.includes(id) ? watch.filter(entry => entry !== id) : [...watch, id]
    localStorage.setItem('lens.watchlist', JSON.stringify(next))
    setWatch(next)
  }
  if (!stock.data) return <div className="page"><section className="panel"><Wait error={stock.error} kind="stock" /></section></div>
  const info = stock.data
  return <div className="page stock-page">
    <Link className="back" to={'/?market=' + info.market}><ArrowLeft size={16} /> 시장</Link>
    <section className="panel stock-detail"><div className="section-heading"><div className="stock-title"><StockMark stock={info} /><div><h1>{info.name}</h1><p>{info.symbol} · {info.exchange}</p></div></div>
      <button aria-label="관심종목" aria-pressed={watch.includes(id)} className="icon-btn" onClick={toggle}><Star size={23} fill={watch.includes(id) ? '#087968' : 'none'} /></button></div>
      {quote?.price != null
        ? <div className="detail-price"><strong>{currency(quote.price, quote.currency)}</strong>{quote.changePercent != null && <span className={'change ' + tone(quote.changePercent)}>{percent(quote.changePercent)}</span>}<span className="status">{quoteStatus(quote)}</span></div>
        : quote === undefined ? <div className="detail-price"><Skeleton kind="quote" label="시세 불러오는 중" /></div> : <Empty>{quote ? quoteStatus(quote) : '시세 확인 불가'}</Empty>}
      {quote?.price != null && <div className="quote-meta">
        {quote.change != null && <>전일 대비 {currency(quote.change, quote.currency)} · </>}거래량 {quote.cumulativeVolume.toLocaleString('ko-KR')}
        {time && <> · {quote.exchangeTimestamp ? '기준' : '조회'} {new Date(time).toLocaleString('ko-KR', { timeZone: quote.exchangeTimestamp && info.market === 'US' ? 'America/New_York' : 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
      </div>}
      <div className="chart-controls">
        <div className="segmented" role="group" aria-label="차트 조회 구간">{chartRanges.map(([value, label]) => <button className={range === value ? 'selected' : ''} aria-pressed={range === value} key={value} onClick={() => setParams({ range: value })}>{label}</button>)}</div>
        {range === '1D' && <div className="segmented">{[['line', '선'], ['1m', '1분 봉'], ['5m', '5분 봉']].map(([value, label]) => <button key={value} className={(params.get('interval') ?? 'line') === value ? 'selected' : ''} onClick={() => setParams({ range, interval: value })}>{label}</button>)}</div>}
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
    </section>
    <aside className="stock-side" aria-label="기업과 판매 상품">
      <section className="panel"><div className="section-heading"><h2>기업 소개</h2><Source href={info.source}>기업 웹사이트</Source></div><p>{info.overview}</p></section>
      <section className="panel"><div className="section-heading"><h2>판매 상품</h2><Link className="plain-link" to={'/compare?first=' + encodeURIComponent(id)}>기업 비교</Link></div>
        {products.data ? <div className="products">{products.data.map(product => <ProductCard key={product.id} product={product} />)}</div> : <Wait error={products.error} kind="products" />}</section>
    </aside>
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
      {item.material && <div className="fact-row"><strong>공개 소재</strong><span>{item.material}</span></div>}
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
  const defaultCriterion = item?.category === 'FRYING_PAN' ? 'AVOID_PTFE' : item?.category === 'COLA' ? 'TOTAL_SUGAR' : 'SODIUM'
  const criterion = (params.get('criterion') || defaultCriterion) as Criterion
  const scope = params.get('scope') || 'OTHER_COMPANY'
  const basis = item?.category === 'COLA' && !criterion.startsWith('AVOID_') ? 'PER_100ML' : ''
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
      {result.data.excluded > 0 && <p className="muted">자료 부족, 비교 조건 차이 또는 기준 미충족으로 {result.data.excluded}개 상품 제외</p>}
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
      }}><option value="">기업을 선택하세요</option>{stocks.data?.map(stock => <option key={stock.id} value={stock.id} disabled={stock.id === (key === 'first' ? second : first)}>{stock.name} · {stock.symbol}</option>)}</select></label>)}</div>
      {stocks.isPending || stocks.error ? <Wait error={stocks.error} /> : null}
    </section>
    {result.data ? <><div className="compare-grid">{result.data.map(row => <section key={row.stock.id} className="panel"><Link className="plain-link" to={pathFor(row.stock.id)}><h2>{row.stock.name}</h2></Link>
      <p>{row.stock.overview}</p>{row.products.map(product => <article key={product.id} className="compare-product"><ProductCard product={product} />
        <p className="muted">{product.prep}</p>{product.facts.filter(fact => fact.basis !== 'PER_100ML').slice(0, 4).map(fact => <div className="fact-row" key={fact.criterion}><span>{criteria[fact.criterion]}</span><strong>{formatFact(fact)}</strong><Source href={fact.source} /></div>)}
        {product.material && <p>{product.material}</p>}</article>)}<Source href={row.stock.source}>기업 출처</Source></section>)}</div>
      <p className="muted">공개 자료가 있는 표본 상품을 비교합니다. 제품별 매출 비중은 제공되지 않습니다.</p></> : result.isFetching || result.error ? <Wait error={result.error} kind="products" /> : <Empty>비교할 두 기업을 선택하세요.</Empty>}
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
      <button className="primary" disabled={natural.isPending || !question.trim()} type="submit"><Sparkles size={17} /> {natural.isPending ? '탐색 중…' : '탐색하기'}</button></form></section>
    <section className="panel"><h2>탐색 조건</h2><div className="fields"><label>상품군<select value={category || result?.filters?.category || ''} onChange={event => filter('category', event.target.value)}>
      <option value="">상품군 선택</option>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>비교 기준<select value={criterion || result?.filters?.criterion || ''} onChange={event => filter('criterion', event.target.value)}>
      <option value="">비교 기준 선택</option>{Object.entries(criteria).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
      {natural.error && <Empty>{natural.error.message} 아래 조건으로 다시 찾아보세요.</Empty>}
    </section>
    {(natural.isPending || (manual.isFetching && !result)) && <section className="panel"><h2>탐색 결과</h2><Skeleton kind="products" label="상품 탐색 중" /></section>}
    {manual.error && !natural.data && <section className="panel"><Wait error={manual.error} /></section>}
    {result && <section className="panel"><h2>탐색 결과</h2><p>{result.message}</p>{result.results.map(row => <article className="match" key={row.product.id}>
      <ProductCard product={row.product} /><div className="match-meta"><strong>{formatFact(row.fact)} · {bases[row.fact.basis]}</strong><Source href={row.fact.source} /></div>
      <Link className="plain-link" to={pathFor(row.stock.id)}>{row.stock.name} · {row.stock.symbol}</Link></article>)}</section>}
  </div>
}

function Watchlist() {
  const stocks = useData<Stock[]>('/stocks')
  const ids = readWatchlist()
  const { getQuote } = useQuotes(ids)
  return <div className="page"><h1>관심종목</h1><section className="panel">{stocks.data ? ids.length
    ? stocks.data.filter(stock => ids.includes(stock.id)).map(stock => <StockRow key={stock.id} stock={stock} quote={getQuote(stock.id)} />)
    : <div className="watchlist-empty"><img src={watchlist} alt="" width={404} height={295} /><Empty>등록된 관심종목이 없습니다. <Link to="/">종목 둘러보기</Link></Empty></div>
    : <Wait error={stocks.error} />}</section></div>
}
