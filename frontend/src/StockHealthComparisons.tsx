import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { bases, categories, criteria, formatFact, pathFor, useData, useQuotes } from './api'
import type { Criterion, Fact, HealthTopic, Match, Product, Quote, Stock } from './api'
import { Empty, Source, Wait } from './ui'
import ProductComparisonCard from './ProductComparisonCard'

type HealthIssue = { criterion: Criterion; baseline: Fact | null; alternative: Match | null; comparisons: Match[] }
type ProductPeer = { product: Product; stock: Stock }
type HealthComparison = { product: Product; issues: HealthIssue[]; peers: ProductPeer[]; topics: HealthTopic[] }
type ComparisonQuote = Quote | null | undefined
type ComparisonRowProps = { row: HealthComparison; stock: Stock; getQuote: (id: string) => ComparisonQuote }

const sodiumLimit = 2_000
const contexts: Partial<Record<Criterion, { title: string; text: string; source?: string }>> = {
  SODIUM: {
    title: '나트륨', text: '나트륨을 과다 섭취하면 혈압이 높아지고 심혈관질환 위험이 커질 수 있습니다. WHO는 성인에게 하루 2,000 mg 미만을 권고합니다.',
    source: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction',
  },
  TOTAL_SUGAR: {
    title: '당류', text: '유리당을 많이 섭취하면 충치 위험이 커질 수 있습니다. 이 표는 제품에 표시된 총당류를 비교하며, WHO의 섭취 권고는 유리당 기준입니다.',
    source: 'https://www.who.int/tools/elena/interventions/free-sugars-adults-ncds',
  },
  ADDED_SUGAR: {
    title: '첨가당', text: '충치 등과 관련해 WHO는 유리당 섭취를 줄이도록 권고합니다. 여기서는 제품 라벨의 첨가당을 100 g 기준으로 비교합니다.',
    source: 'https://www.who.int/tools/elena/interventions/free-sugars-adults-ncds',
  },
  SATURATED_FAT: {
    title: '포화지방', text: 'WHO는 포화지방 섭취량을 하루 총 에너지의 10% 이하로 줄일 것을 권고합니다.',
    source: 'https://www.who.int/publications/i/item/9789240073630',
  },
  AVOID_ASPARTAME: {
    title: '아스파탐', text: 'IARC는 인체 근거가 제한적인 상황에서 아스파탐을 발암 가능 물질(2B군)로 분류했습니다. 섭취량에 따른 위해를 평가한 JECFA는 일일섭취허용량을 체중 1 kg당 40 mg으로 유지했습니다.',
    source: 'https://www.who.int/news/item/14-07-2023-aspartame-hazard-and-risk-assessment-results-released',
  },
  AVOID_PTFE: {
    title: 'PTFE', text: 'PTFE 코팅은 빈 팬을 심하게 과열할 때 분해돼 유해한 기체를 낼 수 있습니다. 독일 연방위해평가원은 과열이 없는 정상 사용에서 건강에 악영향을 예상하지 않습니다.',
    source: 'https://www.bfr.bund.de/en/service/frequently-asked-questions/topic/selected-questions-and-answers-on-cookware-ovenware-and-frying-pans-with-a-non-stick-coating-made-of-ptfe',
  },
  AVOID_PFAS: {
    title: 'PFAS', text: '일부 PFAS는 환경에 오래 남고, 노출과 건강 영향의 연관성이 연구되고 있습니다. 이 비교의 범위는 제조사가 공개한 조리 접촉면의 사용 여부입니다.',
    source: 'https://www.epa.gov/pfas/our-current-understanding-human-health-and-environmental-risks-pfas',
  },
}

const issueLabel = (issue: HealthIssue) => contexts[issue.criterion]?.title ?? criteria[issue.criterion]

export default function StockHealthComparisons({ stock, quote }: { stock: Stock; quote?: Quote | null }) {
  const comparison = useData<HealthComparison[]>(pathFor(stock.id) + '/health-comparisons')
  const rows = comparison.data
  const peerIds = new Set(rows?.flatMap(row => [...row.peers, ...row.issues.flatMap(issue => issue.comparisons)]
    .map(peer => peer.stock.id)))
  const quotes = useQuotes([...peerIds])
  const getQuote = (id: string) => id === stock.id ? quote : quotes.getQuote(id)
  return <section className="panel health-comparisons stock-wide" aria-labelledby="stock-health-heading">
    <header><h2 id="stock-health-heading">판매 상품 건강 이슈 비교</h2>
      <p>{stock.name} 판매 상품과 다른 상장사의 상품을 성분·소재별로 비교합니다.</p></header>
    {rows ? rows.length ? rows.map(row => row.issues.length
      ? <ComparisonRow key={row.product.id} row={row} stock={stock} getQuote={getQuote} />
      : <ProductEvidence key={row.product.id} row={row} stock={stock} getQuote={getQuote} />
    ) : <Empty>비교할 판매 상품이 아직 없습니다.</Empty> : <Wait error={comparison.error} kind="products" />}
  </section>
}

function ProductEvidence({ row, stock, getQuote }: ComparisonRowProps) {
  return <article className="health-item" aria-label={row.product.name + ' 건강 이슈 자료'}>
    <div className="section-heading health-criteria"><div><strong>{categories[row.product.category]}</strong><small>{row.product.prep}</small></div></div>
    <HealthMatchup origin={<EvidenceProduct product={row.product} stock={stock} quote={getQuote(stock.id)} />}
      peers={row.peers.map(peer => <EvidenceProduct key={peer.product.id} {...peer} quote={getQuote(peer.stock.id)} competitor />)} />
    {row.peers.length > 0 && <p className="health-context">제품별로 공개된 시험 조건과 사양을 확인할 수 있습니다.</p>}
  </article>
}

function HealthMatchup({ origin, peers }: { origin: ReactNode; peers: ReactNode[] }) {
  return <div className="health-pair" data-peers={peers.length}>
    {origin}
    {peers.length > 0 && <>
      <div className="health-divider"><span className="vs-badge" aria-hidden="true">VS</span></div>
      <div className="health-peers" role="group" aria-label="타 기업 비교 상품">{peers}</div>
    </>}
  </div>
}

function EvidenceProduct({ product, stock, quote, competitor = false }: ProductPeer & { quote?: Quote | null; competitor?: boolean }) {
  const evidence = product.evidence[0]
  return <ProductComparisonCard product={product} stock={stock} quote={quote} label={competitor ? '타 기업 비교 상품' : '이 기업 상품'}>
    {product.material && <small>{product.material}</small>}
    {evidence && <p className="health-context">{evidence.summary}</p>}
    <div className="comparison-links"><Source href={evidence?.source ?? product.source}>{evidence?.title ?? '상품 자료'}</Source></div>
  </ProductComparisonCard>
}

function ComparisonRow({ row, stock, getQuote }: ComparisonRowProps) {
  const [selected, setSelected] = useState<Criterion>(() => (
    row.issues.find(issue => issue.alternative) ?? row.issues.find(issue => issue.baseline && issue.comparisons.length)
      ?? row.issues.find(issue => issue.baseline) ?? row.issues[0]
  ).criterion)
  const issue = row.issues.find(item => item.criterion === selected) ?? row.issues[0]
  const context = contexts[issue.criterion]
  const comparisons = issue.comparisons
  const values = issue.baseline && comparisons.length ? [issue.baseline.value, ...comparisons.map(item => item.fact.value)] : []
  const lowest = Math.min(...values)
  const winner = (value: number | undefined) => value === lowest && values.some(other => other > lowest)
  const qualitative = !comparisons.length ? row.peers : []
  return <article className="health-item" aria-label={row.product.name + ' 건강 이슈 비교'}>
    <div className="section-heading health-criteria">
      <div><strong>{issueLabel(issue)}</strong><small>{row.product.prep}
        {issue.baseline?.basis.startsWith('PER_100') && ' · ' + bases[issue.baseline.basis] + ' 기준'}</small></div>
      {row.issues.length > 1 && <div className="segmented" role="group" aria-label={row.product.name + ' 비교 항목'}>{row.issues.map(item =>
        <button key={item.criterion} type="button" className={item.criterion === selected ? 'selected' : ''} aria-pressed={item.criterion === selected}
          onClick={() => setSelected(item.criterion)}>{issueLabel(item)}</button>)}</div>}
    </div>
    <HealthMatchup origin={<HealthProduct product={row.product} stock={stock} quote={getQuote(stock.id)} fact={issue.baseline}
      criterion={issue.criterion} winner={winner(issue.baseline?.value)} />}
      peers={comparisons.length ? comparisons.map(item => <HealthProduct key={item.product.id} {...item} criterion={issue.criterion}
        quote={getQuote(item.stock.id)} reduction={item.reductionPercent} winner={winner(item.fact.value)} competitor />)
        : qualitative.map(peer => <EvidenceProduct key={peer.product.id} {...peer} quote={getQuote(peer.stock.id)} competitor />)} />
    {context && <p className="health-context"><strong>건강 쟁점</strong> {context.text} {context.source && <Source href={context.source}>기관 근거</Source>}</p>}
    {row.topics?.map(topic => {
      const evidence = row.product.evidence.find(item => item.topic === topic.id)
      return <details key={topic.id} className="health-topic-detail">
        <summary>{topic.name} 건강 이슈 <small>{topic.category}</small></summary>
        {evidence && <p>{evidence.summary} <Source href={evidence.source}>상품 근거</Source></p>}
        <p>{topic.assessment}</p>
        <div className="topic-links">{topic.sources.map(source => <Source key={source.url} href={source.url}>{source.title}</Source>)}
          <Link className="plain-link" to={'/health?topic=' + topic.id}>관련 종목</Link></div>
      </details>
    })}
  </article>
}

function HealthProduct({ product, stock, quote, fact, criterion, reduction, winner, competitor = false }: ProductPeer & {
  quote?: Quote | null; fact: Fact | null; criterion: Criterion; reduction?: number | null; winner: boolean; competitor?: boolean
}) {
  const secondaryCriterion = criterion === 'TOTAL_SUGAR' ? 'AVOID_ASPARTAME' : criterion === 'AVOID_ASPARTAME' ? 'TOTAL_SUGAR' : null
  const secondary = secondaryCriterion && product.facts.find(item => item.criterion === secondaryCriterion &&
    item.basis === (secondaryCriterion === 'TOTAL_SUGAR' ? 'PER_100ML' : 'INGREDIENTS'))
  const sodium = criterion === 'SODIUM' && fact?.unit === 'mg' ? Math.round(fact.value / sodiumLimit * 100) : null
  return <ProductComparisonCard product={product} stock={stock} quote={quote} winner={winner} label={competitor ? '타 기업 비교 상품' : '이 기업 상품'}>
    <div className="comparison-value"><strong>{fact ? formatFact(fact) : '자료 없음'}</strong>
      {reduction != null && <span className="status">{reduction}% 낮음</span>}
    </div>
    {winner && <span className="winner-reason">{criterion.startsWith('AVOID_') ? criteria[criterion] : criteria[criterion] + ' 낮음'}</span>}
    {sodium != null && <small>WHO 성인 하루 기준의 {sodium}%</small>}
    {!fact && product.material && <small>{product.material}</small>}
    {secondary && <small>{secondary.criterion === 'TOTAL_SUGAR' ? '당류' : '아스파탐'} {formatFact(secondary)}
      {secondary.basis === 'PER_100ML' && ' / ' + bases[secondary.basis]}</small>}
    {fact && <div className="comparison-links"><Source href={fact.source}>상품 자료</Source></div>}
  </ProductComparisonCard>
}
