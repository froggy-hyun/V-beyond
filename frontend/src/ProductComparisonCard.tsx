import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { relations } from './api'
import type { Product, Quote, Stock } from './api'
import { ProductPhoto, StockRow } from './ui'
import winnerCharacter from './assets/brand/winner.webp'

export default function ProductComparisonCard({ product, stock, quote, label, winner, children }: {
  product: Product
  stock: Stock
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
      <small>{product.brand} · {relations[product.relation]}</small>
    </div></div>
    <div className="comparison-data">{children}</div>
    <StockRow stock={stock} quote={quote} compact />
  </article>
}
