import type { ReactNode } from 'react'
import { CookingPot, CupSoda, Soup, Utensils, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categories, currency, pathFor, percent, relations, tone } from './api'
import type { Category, Product, Quote, Stock } from './api'

const icons = { RAMEN: Soup, FRYING_PAN: Utensils, CHICKEN_NOODLE_SOUP: CookingPot, COLA: CupSoda }
export function ProductIcon({ category }: { category: Category }) {
  const Icon = icons[category]
  return <div className={'product-icon ' + category.toLowerCase()}><Icon aria-hidden size={27} strokeWidth={1.55} /></div>
}
export function ProductCard({ product }: { product: Product }) {
  return <Link className="product-card" to={'/products/' + product.id}>
    <ProductIcon category={product.category} />
    <div><small>{product.brand} · {relations[product.relation]}</small><strong>{product.name}</strong><small>{product.size}</small></div>
    <ChevronRight aria-hidden size={17} className="muted" />
  </Link>
}
export function StockMark({ stock }: { stock: Stock }) {
  const palette: Record<string, string> = { '004370': 'red', '007310': 'orange', '003230': 'violet', '017810': 'green', NWL: 'blue', WSM: 'orange', CPB: 'red', GIS: 'blue', KO: 'red', PEP: 'blue' }
  return <span className={'stock-mark ' + palette[stock.symbol]} aria-hidden>{stock.market === 'KR' ? stock.name.slice(0, 1) : stock.symbol.slice(0, 2)}</span>
}
export function QuoteValue({ quote }: { quote?: Quote }) {
  return quote?.price != null ? <span className="quote-value">
    <strong>{currency(quote.price, quote.currency)}</strong>
    <span className={'change ' + tone(quote.changePercent ?? 0)}>{quote.changePercent == null ? '–' : percent(quote.changePercent)}</span>
  </span> : <span className="muted">{quote ? '시세 확인 불가' : '시세 확인 중'}</span>
}
export function StockRow({ stock, quote, showVolume = false }: { stock: Stock; quote?: Quote; showVolume?: boolean }) {
  return <Link className="stock-row" to={pathFor(stock.id)}>
    <StockMark stock={stock} /><span className="stock-label"><strong>{stock.name}</strong><small>{stock.symbol} · {stock.exchange}</small>
      {showVolume && quote?.price != null && <small>거래량 {quote.cumulativeVolume.toLocaleString('ko-KR')}</small>}
    </span>
    <QuoteValue quote={quote} /><ChevronRight size={16} aria-hidden className="row-chevron muted" />
  </Link>
}
export function Source({ href, children = '원문 보기' }: { href: string; children?: ReactNode }) {
  if (!href.startsWith('https://')) return null
  return <a className="source" href={href} target="_blank" rel="noreferrer">{children} <span aria-hidden>↗</span></a>
}
export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p> }
export function Wait({ error }: { error: Error | null }) { return <Empty>{error?.message || '불러오는 중…'}</Empty> }
export const groupLabel = (category: Category) => categories[category]
