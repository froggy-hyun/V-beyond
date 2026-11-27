import { useState } from 'react'
import { bases, criteria, formatFact, pathFor, useData, useQuotes } from './api'
import type { Criterion, Fact, HealthAssessment, HealthTopic, Match, Product, Quote, Stock } from './api'
import { DiseaseEvidence, ProductDiseaseEvidence } from './DiseaseEvidence'
import { Source, Wait } from './ui'
import ProductComparisonCard from './ProductComparisonCard'

type HealthIssue = { criterion: Criterion; baseline: Fact; alternative: Match | null; comparisons: Match[]; topic: HealthTopic }
type HealthComparison = { product: Product; issues: HealthIssue[]; assessments: HealthAssessment[] }
type ComparisonQuote = Quote | null | undefined

const issueLabel = (issue: HealthIssue) => issue.criterion === 'ADDED_SUGAR' ? criteria.ADDED_SUGAR : issue.topic.name

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
          winner={winner(item.fact.value)} competitor />)}
      </div>
    </div>
    <section className="health-topic" aria-label={issue.topic.name + ' 건강 쟁점'}>
      <header><h3>건강 쟁점</h3></header>
      <DiseaseEvidence topic={issue.topic} />
    </section>
    {row.assessments.filter(item => item.topic.id !== issue.topic.id).map(assessment =>
      <ProductDiseaseEvidence key={assessment.topic.id} assessment={assessment} />)}
  </article>
}

function HealthProduct({ product, stock, quote, fact, reductionPercent, winner, competitor = false }: {
  product: Product; stock: Stock; quote?: Quote | null; fact: Fact; reductionPercent?: number | null; winner: boolean; competitor?: boolean
}) {
  const { criterion } = fact
  const secondaryCriterion = criterion === 'TOTAL_SUGAR' ? 'AVOID_ASPARTAME' : criterion === 'AVOID_ASPARTAME' ? 'TOTAL_SUGAR' : null
  const secondary = secondaryCriterion && product.facts.find(item => item.criterion === secondaryCriterion &&
    item.basis === (secondaryCriterion === 'TOTAL_SUGAR' ? 'PER_100ML' : 'INGREDIENTS'))
  return <ProductComparisonCard product={product} stock={stock} quote={quote} winner={winner} label={competitor ? '타 기업 비교 상품' : '이 기업 상품'}>
    <div className="comparison-value"><strong>{formatFact(fact)}</strong>
      {reductionPercent != null && <span className="status">{reductionPercent}% 낮음</span>}
    </div>
    {winner && <span className="winner-reason">{criterion.startsWith('AVOID_') ? criteria[criterion] : criteria[criterion] + ' 낮음'}</span>}
    {secondary && <small>{secondary.criterion === 'TOTAL_SUGAR' ? '당류' : '아스파탐'} {formatFact(secondary)}
      {secondary.basis === 'PER_100ML' && ' / ' + bases[secondary.basis]}</small>}
    <div className="comparison-links"><Source href={fact.source}>상품 자료</Source></div>
  </ProductComparisonCard>
}
