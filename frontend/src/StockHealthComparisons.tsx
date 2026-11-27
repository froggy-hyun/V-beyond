import { useState } from 'react'
import { bases, criteria, formatFact, pathFor, useData, useQuotes } from './api'
import type { Criterion, Fact, HealthTopic, Match, Product, Quote, Stock } from './api'
import { DiseaseEvidence } from './DiseaseEvidence'
import { Source, Wait } from './ui'
import ProductComparisonCard from './ProductComparisonCard'

type HealthIssue = { criterion: Criterion; baseline: Fact; alternative: Match | null; comparisons: Match[]; topic: HealthTopic }
type HealthComparison = { product: Product; issues: HealthIssue[] }
type ComparisonQuote = Quote | null | undefined

const issueLabel = (issue: HealthIssue) => issue.criterion === 'ADDED_SUGAR' ? criteria.ADDED_SUGAR : issue.topic.name
const differenceNumber = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 })

function differenceLabel(fact: Fact, baseline: number) {
  if (fact.criterion.startsWith('AVOID_')) return null
  const delta = fact.value - baseline
  if (delta === 0) return '동일'
  if (baseline === 0) return formatFact({ ...fact, value: delta }) + ' 높음'
  const ratio = Math.abs(delta / baseline * 100)
  const percent = ratio < 0.1 ? '0.1% 미만' : differenceNumber.format(ratio) + '%'
  return percent + (delta < 0 ? ' 낮음' : ' 높음')
}

export default function StockHealthComparisons({ stock, quote }: { stock: Stock; quote?: Quote | null }) {
  const comparison = useData<HealthComparison[]>(pathFor(stock.id) + '/health-comparisons')
  const rows = comparison.data
  const peerIds = new Set(rows?.flatMap(row => row.issues.flatMap(issue => issue.comparisons.map(peer => peer.stock.id))))
  const { getQuote } = useQuotes([...peerIds])
  if (rows?.length === 0) return null
  return <section className="panel health-comparisons stock-wide" aria-labelledby="stock-health-heading">
    <header><h2 id="stock-health-heading">판매 상품 건강 이슈 비교</h2>
      <p>{stock.name} 판매 상품과 다른 상장사의 상품을 같은 성분·소재 기준으로 비교합니다.</p></header>
    {rows ? rows.map(row => <ComparisonRow key={row.product.id} row={row} stock={stock} quote={quote} getQuote={getQuote} />)
      : <Wait error={comparison.error} kind="products" />}
  </section>
}

function ComparisonRow({ row, stock, quote, getQuote }: { row: HealthComparison; stock: Stock; quote?: Quote | null; getQuote: (id: string) => ComparisonQuote }) {
  const [selected, setSelected] = useState<Criterion>(() => (row.issues.find(issue => issue.alternative) ?? row.issues[0]).criterion)
  const issue = row.issues.find(item => item.criterion === selected) ?? row.issues[0]
  const evidenceHeading = issueLabel(issue) + ' 건강 쟁점'
  const values = [issue.baseline.value, ...issue.comparisons.map(item => item.fact.value)]
  const lowest = Math.min(...values)
  const winner = (value: number) => value === lowest && values.some(other => other > lowest)
  return <article className="health-item" aria-label={row.product.name + ' 건강 이슈 비교'}>
    <div className="section-heading health-criteria">
      <div><strong>{issueLabel(issue)}</strong><small>{row.product.prep}
        {issue.baseline.basis.startsWith('PER_100') && ' · ' + bases[issue.baseline.basis] + ' 기준'}</small></div>
      {row.issues.length > 1 && <div className="segmented" role="group" aria-label={row.product.name + ' 비교 항목'}>{row.issues.map(item =>
        <button key={item.criterion} type="button" className={item.criterion === selected ? 'selected' : ''} aria-pressed={item.criterion === selected}
          onClick={() => setSelected(item.criterion)}>{issueLabel(item)}</button>)}</div>}
    </div>
    <div className="health-pair" data-peers={issue.comparisons.length}>
      <HealthProduct product={row.product} stock={stock} quote={quote} fact={issue.baseline} winner={winner(issue.baseline.value)} />
      <div className="health-divider"><span className="vs-badge" aria-hidden="true">VS</span></div>
      <div className="health-peers" role="group" aria-label="타 기업 비교 상품">
        {issue.comparisons.map(item => <HealthProduct key={item.product.id} {...item} quote={getQuote(item.stock.id)}
          winner={winner(item.fact.value)} baseline={issue.baseline.value} />)}
      </div>
    </div>
    <section className="health-topic" aria-label={evidenceHeading}>
      <header><h3>{evidenceHeading}</h3></header>
      <DiseaseEvidence topic={issue.topic} />
    </section>
  </article>
}

function HealthProduct({ product, stock, quote, fact, baseline, winner }: {
  product: Product; stock: Stock; quote?: Quote | null; fact: Fact; baseline?: number; winner: boolean
}) {
  const { criterion } = fact
  const difference = baseline === undefined ? null : differenceLabel(fact, baseline)
  return <ProductComparisonCard product={product} stock={stock} quote={quote} winner={winner} label={baseline === undefined ? '이 기업 상품' : '타 기업 비교 상품'}>
    <div className="comparison-value"><strong>{formatFact(fact)}</strong>
      {difference && <span className="status" aria-label={'이 기업 상품 대비 ' + difference}>{difference}</span>}
    </div>
    {winner && <span className="winner-reason">{criterion.startsWith('AVOID_') ? criteria[criterion] : criteria[criterion] + ' 낮음'}</span>}
    <div className="comparison-links"><Source href={fact.source}>상품 자료</Source></div>
  </ProductComparisonCard>
}
