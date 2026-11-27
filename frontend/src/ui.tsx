import type { ReactNode } from 'react'
import { Building2, CookingPot, CupSoda, Soup, Utensils, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categories, currency, pathFor, percent, relations, tone } from './api'
import type { Category, Product, Quote, Stock } from './api'
import imageSources from './assets/image-sources.json'

const issuerImages = import.meta.glob<string>('./assets/issuers/*.png', { eager: true, query: '?url', import: 'default' })
const productImages = import.meta.glob<string>('./assets/products/*.webp', { eager: true, query: '?url', import: 'default' })
const productSources: Record<string, { page: string; image: string }> = imageSources.products
export const productPhotoSource = (id: string) => productSources[id]?.page

const icons = { RAMEN: Soup, FRYING_PAN: Utensils, CHICKEN_NOODLE_SOUP: CookingPot, COLA: CupSoda }
export function ProductIcon({ category }: { category: Category }) {
  const Icon = icons[category]
  return <div className={'product-icon ' + category.toLowerCase()}><Icon aria-hidden size={27} strokeWidth={1.55} /></div>
}
export function ProductCard({ product }: { product: Product }) {
  return <Link className="product-card" to={'/products/' + product.id}>
    <ProductPhoto product={product} />
    <div><small>{product.brand} · {relations[product.relation]}</small><strong>{product.name}</strong><small>{product.size}</small></div>
    <ChevronRight aria-hidden size={17} className="muted" />
  </Link>
}
export function ProductPhoto({ product, detail = false }: { product: Product; detail?: boolean }) {
  const photo = productImages[`./assets/products/${product.id}.webp`]
  if (!photo) return <ProductIcon category={product.category} />
  return <div className="product-photo"><img src={photo} alt={detail ? `${product.name} 제품 사진` : ''} loading={detail ? 'eager' : 'lazy'} decoding="async" /></div>
}
export function StockMark({ stock }: { stock: Stock }) {
  const logo = issuerImages[`./assets/issuers/${stock.symbol}.png`]
  return <span className="stock-mark" aria-hidden>{logo ? <img src={logo} alt="" decoding="async" /> : <Building2 size={17} />}</span>
}
export function QuoteValue({ quote }: { quote?: Quote | null }) {
  if (quote === undefined) return <Skeleton kind="quote" label="시세 불러오는 중" />
  return quote?.price != null ? <span className="quote-value">
    <strong>{currency(quote.price, quote.currency)}</strong>
    <span className={'change ' + tone(quote.changePercent ?? 0)}>{quote.changePercent == null ? '–' : percent(quote.changePercent)}</span>
  </span> : <span className="muted">시세 확인 불가</span>
}
export function StockRow({ stock, quote, showVolume = false }: { stock: Stock; quote?: Quote | null; showVolume?: boolean }) {
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
type LoadShape = 'rows' | 'products' | 'chart' | 'stock' | 'product' | 'highlights' | 'quote'

function SkeletonRow() {
  return <span className="skeleton-row"><i /><span><i /><i /></span><i /></span>
}

export function Skeleton({ kind, label = '불러오는 중' }: { kind: LoadShape; label?: string }) {
  return <span className={`skeleton skeleton-${kind}`} role="status" aria-label={label}>
    <span className="skeleton-content" aria-hidden>
      {kind === 'rows' || kind === 'products' || kind === 'highlights'
        ? <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        : kind === 'stock' || kind === 'product' ? <><SkeletonRow /><i className="skeleton-body" /></>
          : <><i /><i /></>}
    </span>
  </span>
}

export function Wait({ error, kind = 'rows' }: { error: Error | null; kind?: LoadShape }) {
  return error ? <Empty>{error.message}</Empty> : <Skeleton kind={kind} />
}
export const groupLabel = (category: Category) => categories[category]
