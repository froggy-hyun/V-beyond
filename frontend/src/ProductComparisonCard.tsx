import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { bases, formatFact, relations, useQuotes } from './api'
import type { Match, Product, Quote, Stock } from './api'
import { ProductPhoto, Source, StockRow } from './ui'
import winnerCharacter from './assets/brand/winner.webp'

export default function ProductComparisonCard({ product, stock, quote, label, winner, children }: {
  product: Pick<Product, 'id' | 'name'> & Partial<Pick<Product, 'category' | 'brand' | 'relation'>>
  stock?: Stock
  quote?: Quote | null
  label?: string
  winner?: boolean
  children: ReactNode
}) {
  return <article className="comparison-card" data-winner={winner}>
    {winner && <span className="winner-sticker"><img src={winnerCharacter} width={112} height={155} alt="" />WINNER</span>}
    {label && <small className="comparison-label">{label}</small>}
    <div className="comparison-product"><ProductPhoto product={product} /><div>
      <h3><Link to={'/products/' + product.id}>{product.name}</Link></h3>
      {product.brand && product.relation && <small>{product.brand} · {relations[product.relation]}</small>}
    </div></div>
    <div className="comparison-data">{children}</div>
    {stock && <StockRow stock={stock} quote={quote} compact />}
  </article>
}

export function ProductMatchGrid({ matches }: { matches: Match[] }) {
  const { getQuote } = useQuotes([...new Set(matches.map(match => match.stock.id))])
  return <div className="comparison-card-grid">{matches.map(match =>
    <ProductComparisonCard key={match.product.id} product={match.product} stock={match.stock} quote={getQuote(match.stock.id)}>
      <div className="comparison-value"><strong>{formatFact(match.fact)}</strong>
        {match.reductionPercent != null && <span className="status">{match.reductionPercent}% 낮음</span>}</div>
      <small>{bases[match.fact.basis]}</small>
      <div className="comparison-links"><Source href={match.fact.source}>상품 자료</Source></div>
    </ProductComparisonCard>)}</div>
}
