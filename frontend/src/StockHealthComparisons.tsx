import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { bases, criteria, formatFact, pathFor, relations, useData } from './api'
import type { Criterion, Fact, Match, Product, Stock } from './api'
import { Empty, ProductPhoto, Source, Wait } from './ui'

type HealthIssue = { criterion: Criterion; baseline: Fact | null; alternative: Match | null }
type HealthComparison = { product: Product; issues: HealthIssue[] }

const sodiumLimit = 2_000
const contexts: Partial<Record<Criterion, { title: string; text: string; source?: string }>> = {
  SODIUM: {
    title: '나트륨', text: 'WHO는 성인에게 나트륨을 하루 2,000 mg 미만으로 섭취할 것을 권고합니다.',
    source: 'https://www.who.int/news-room/fact-sheets/detail/sodium-reduction',
  },
  TOTAL_SUGAR: {
    title: '당류', text: '제품 표시에 있는 총당류를 100 mL 기준으로 비교합니다. WHO의 섭취 권고는 유리당을 기준으로 합니다.',
    source: 'https://www.who.int/tools/elena/interventions/free-sugars-adults-ncds',
  },
  AVOID_ASPARTAME: {
    title: '아스파탐', text: 'IARC는 제한적 근거로 아스파탐을 2B군으로 분류했습니다. JECFA는 일일섭취허용량을 체중 1 kg당 40 mg으로 유지했습니다.',
    source: 'https://www.who.int/news/item/14-07-2023-aspartame-hazard-and-risk-assessment-results-released',
  },
  AVOID_PTFE: {
    title: 'PTFE', text: '독일 연방위해평가원은 PTFE 코팅을 정상적으로 사용하면 건강에 악영향을 예상하지 않으며, 빈 팬의 과열을 피하라고 안내합니다.',
    source: 'https://www.bfr.bund.de/en/service/frequently-asked-questions/topic/selected-questions-and-answers-on-cookware-ovenware-and-frying-pans-with-a-non-stick-coating-made-of-ptfe',
  },
  AVOID_PFAS: { title: 'PFAS', text: '제조사가 공개한 조리 접촉면의 PFAS 사용 여부를 비교합니다.' },
}

const issueLabel = (issue: HealthIssue) => contexts[issue.criterion]?.title ?? criteria[issue.criterion]

export default function StockHealthComparisons({ stock }: { stock: Stock }) {
  const comparison = useData<HealthComparison[]>(pathFor(stock.id) + '/health-comparisons')
  return <section className="panel health-comparisons" aria-labelledby="stock-health-heading">
    <h2 id="stock-health-heading">판매 상품 건강 이슈 비교</h2>
    <p>성분·소재별로 {stock.name} 판매 상품과 다른 상장사의 대안을 비교합니다.</p>
    {comparison.data ? comparison.data.length ? comparison.data.map(row =>
      <ComparisonRow key={row.product.id} row={row} stock={stock} />
    ) : <Empty>비교할 판매 상품이 아직 없습니다.</Empty> : <Wait error={comparison.error} kind="products" />}
  </section>
}

function ComparisonRow({ row, stock }: { row: HealthComparison; stock: Stock }) {
  const [selected, setSelected] = useState<Criterion>(() => (
    row.issues.find(issue => issue.alternative) ?? row.issues.find(issue => issue.baseline) ?? row.issues[0]
  ).criterion)
  const issue = row.issues.find(item => item.criterion === selected) ?? row.issues[0]
  const context = contexts[issue.criterion]
  const alternative = issue.alternative
  return <article className="health-item" aria-label={row.product.name + ' 건강 이슈 비교'}>
    <div className="section-heading health-criteria">
      <div><strong>{issueLabel(issue)}</strong><small>{row.product.prep}{issue.baseline?.basis === 'PER_100ML' && ' · 100 mL 기준'}</small></div>
      {row.issues.length > 1 && <div className="segmented" role="group" aria-label={row.product.name + ' 비교 항목'}>{row.issues.map(item =>
        <button key={item.criterion} type="button" className={item.criterion === selected ? 'selected' : ''} aria-pressed={item.criterion === selected}
          onClick={() => setSelected(item.criterion)}>{issueLabel(item)}</button>)}</div>}
    </div>
    <div className="health-pair">
      <HealthProduct product={row.product} stock={stock} fact={issue.baseline} criterion={issue.criterion} />
      {alternative ? <HealthProduct product={alternative.product} stock={alternative.stock} fact={alternative.fact}
        criterion={issue.criterion} reduction={alternative.reductionPercent} competitor />
        : <div className="health-side health-empty"><small>타 기업 대안</small><p>{issue.baseline
          ? '같은 기준에서 더 낮은 값이나 미사용을 확인한 타 기업 상품이 없습니다.'
          : '이 상품의 공개 수치나 소재 정보가 부족해 대안을 비교할 수 없습니다.'}</p></div>}
    </div>
    {context && <p className="health-context">{context.text} {context.source && <Source href={context.source}>기관 근거</Source>}</p>}
  </article>
}

function HealthProduct({ product, stock, fact, criterion, reduction, competitor = false }: {
  product: Product; stock: Stock; fact: Fact | null; criterion: Criterion; reduction?: number | null; competitor?: boolean
}) {
  const secondaryCriterion = criterion === 'TOTAL_SUGAR' ? 'AVOID_ASPARTAME' : criterion === 'AVOID_ASPARTAME' ? 'TOTAL_SUGAR' : null
  const secondary = secondaryCriterion && product.facts.find(item => item.criterion === secondaryCriterion &&
    item.basis === (secondaryCriterion === 'TOTAL_SUGAR' ? 'PER_100ML' : 'INGREDIENTS'))
  const sodium = criterion === 'SODIUM' && fact?.unit === 'mg' ? Math.round(fact.value / sodiumLimit * 100) : null
  return <div className="health-side">
    <small>{competitor ? '타 기업 대안' : '이 기업 상품'}</small>
    <div className="health-product"><ProductPhoto product={product} /><div>
      <h3><Link to={'/products/' + product.id}>{product.name}</Link></h3><small>{stock.name} · {relations[product.relation]}</small>
    </div></div>
    <div className="health-value"><strong>{fact ? formatFact(fact) : '자료 없음'}</strong>
      {reduction != null && <span className="status">{reduction}% 낮음</span>}
    </div>
    {sodium != null && <small>WHO 성인 하루 기준의 {sodium}%</small>}
    {secondary && <small>{secondary.criterion === 'TOTAL_SUGAR' ? '당류' : '아스파탐'} {formatFact(secondary)}
      {secondary.basis === 'PER_100ML' && ' / ' + bases[secondary.basis]}</small>}
    <div className="health-links">
      {fact && <Source href={fact.source}>상품 자료</Source>}
      {competitor && <Link className="plain-link" to={pathFor(stock.id)}>{stock.name} 종목 바로가기 <ChevronRight size={14} aria-hidden /></Link>}
    </div>
  </div>
}
