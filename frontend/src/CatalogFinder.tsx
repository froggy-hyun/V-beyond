import { ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { categories, useData, useQuotes } from './api'
import type { Category, Product, Stock } from './api'
import { ChoiceButtons } from './ChoiceButtons'
import ProductComparisonCard from './ProductComparisonCard'
import { Empty, ProductIcon, Source, StockRow, Wait } from './ui'

type Mode = 'stocks' | 'products'
type Catalog = { stocks: Stock[]; products: Product[] }
const markets = [['', '전체'], ['KR', '국내'], ['US', '미국']] as const

export default function CatalogFinder({ mode }: { mode: Mode }) {
  const [params, setParams] = useSearchParams()
  const categoryParam = params.get('category')
  const category = categoryParam && Object.hasOwn(categories, categoryParam) ? categoryParam as Category : 'RAMEN'
  const market = markets.find(([value]) => value === params.get('market'))?.[0] ?? ''
  const search = useData<Catalog>('/products?' + new URLSearchParams({ category, market }))
  const setFilters = (nextCategory: Category, nextMarket: string) => setParams(
    nextMarket ? { category: nextCategory, market: nextMarket } : { category: nextCategory }, { replace: true })
  const stockMode = mode === 'stocks'
  const title = stockMode ? '종목 찾기' : '상품 찾기'
  return <div className="page">
    <header><div className="section-heading"><h1>{title}</h1>
      <Link className="plain-link" to={stockMode ? '/health' : '/ai'}>{stockMode ? '건강 이슈 성분으로 찾기' : '자연어로 탐색'} <ChevronRight size={16} aria-hidden /></Link>
    </div></header>
    <section className="panel">
      <ChoiceButtons label="상품군" choices={categories} value={category}
        icon={value => <ProductIcon category={value} />} onSelect={value => setFilters(value, market)} />
      <div className="segmented" role="group" aria-label="판매 시장">{markets.map(([value, name]) =>
        <button key={value} type="button" aria-pressed={market === value} className={market === value ? 'selected' : ''}
          onClick={() => setFilters(category, value)}>{name}</button>)}</div>
    </section>
    <section className="panel" aria-labelledby="catalog-finder-results">
      <div className="section-heading"><h2 id="catalog-finder-results">{stockMode ? '관련 종목' : '등록 상품'}</h2>
        {search.data && <small>{stockMode ? `${search.data.stocks.length}개 종목` : `${search.data.products.length}개 상품`}</small>}</div>
      {search.data ? stockMode ? <StockResults catalog={search.data} /> : <CatalogProducts products={search.data.products} />
        : <Wait error={search.error} kind={stockMode ? 'rows' : 'products'} />}
    </section>
  </div>
}

function StockResults({ catalog }: { catalog: Catalog }) {
  const { getQuote } = useQuotes(catalog.stocks.map(stock => stock.id))
  if (!catalog.stocks.length) return <Empty>선택한 시장에 관련 종목이 없습니다.</Empty>
  return <div className="finder-stocks">{catalog.stocks.map(stock => {
    const products = catalog.products.filter(product => product.symbol === stock.symbol && product.market === stock.market)
    return <article key={stock.id}>
      <StockRow stock={stock} quote={getQuote(stock.id)} />
      <div className="tags">{products.slice(0, 3).map(product => <Link key={product.id} to={'/products/' + product.id}>{product.name}</Link>)}
        {products.length > 3 && <Link to={'/stocks/' + encodeURIComponent(stock.id) + '?tab=products'}>판매 상품 {products.length}개</Link>}
      </div>
    </article>
  })}</div>
}

function CatalogProducts({ products }: { products: Product[] }) {
  if (!products.length) return <Empty>선택한 시장에 등록 상품이 없습니다.</Empty>
  return <div className="comparison-card-grid">{products.map(product =>
    <ProductComparisonCard key={product.id} product={product}>
      <small>{product.market === 'KR' ? '국내' : '미국'} 판매 · {product.size}</small>
      <div className="comparison-links"><Source href={product.source}>상품 근거</Source></div>
    </ProductComparisonCard>)}</div>
}
