import { ChevronRight, FlaskConical, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { bases, formatFact, pathFor, useData } from './api'
import type { Fact, HealthTopic, Stock } from './api'
import { Empty, Source, StockMark, Wait } from './ui'

type Match = { stock: Stock; productId: string; productName: string; market: string; detail: string | null; source: string; fact: Fact | null }
type Result = { topic: HealthTopic; matches: Match[] }
const normalize = (text: string) => text.toLocaleLowerCase('ko-KR').replace(/[\s·-]+/g, '')

export default function HealthPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const term = normalize(query)
  const topics = useData<Result[]>('/health-topics')
  const matched = topics.data?.filter(({ topic }) => [topic.name, topic.category, ...topic.aliases].some(text => normalize(text).includes(term))) ?? []
  const selected = matched.find(({ topic }) => topic.id === params.get('topic')) ?? (term ? matched[0] : undefined)
  const edit = (value: string) => setParams(value ? { q: value } : {}, { replace: true })
  const choose = (id: string) => setParams(query ? { q: query, topic: id } : { topic: id })
  return <div className="page health-page">
    <header><h1>건강 이슈 성분으로 종목 찾기</h1><p>성분표와 제품 사양을 확인한 상품에서 관련 상장사를 찾아보세요.</p></header>
    <section className="panel">
      <div className="search-field"><Search size={19} aria-hidden /><input value={query} maxLength={70} onChange={event => edit(event.target.value)}
        aria-label="성분·소재 검색" placeholder="아질산나트륨, 보존료, 아스파탐 검색" /></div>
      {topics.data ? matched.length > 0 ? <div className="topic-choices" role="group" aria-label="건강 이슈 성분">
        {matched.map(({ topic }) => <button key={topic.id} type="button" onClick={() => choose(topic.id)}
          aria-pressed={selected?.topic.id === topic.id}><FlaskConical size={20} aria-hidden /><span><strong>{topic.name}</strong><small>{topic.category}</small></span></button>)}
      </div> : <Empty>등록된 성분에서 검색 결과를 찾지 못했습니다.</Empty> : <Wait error={topics.error} />}
    </section>
    {selected && <TopicResults selection={selected} />}
  </div>
}

function TopicResults({ selection: { topic, matches } }: { selection: Result }) {
  const byStock = new Map<string, Match[]>()
  for (const match of matches) {
    const products = byStock.get(match.stock.id) ?? []
    products.push(match)
    byStock.set(match.stock.id, products)
  }
  return <>
    <section className="panel topic-assessment" aria-label={topic.name + ' 기관 평가'}>
      <div className="section-heading"><h2>{topic.name} 건강 이슈</h2><span className="status">{topic.category}</span></div>
      <p>{topic.assessment}</p>
      <div className="topic-links">{topic.sources.map(source => <Source key={source.url} href={source.url}>{source.title}</Source>)}</div>
    </section>
    <section className="panel" aria-labelledby="related-companies">
      <div className="section-heading"><h2 id="related-companies">관련 종목</h2><span className="muted">{byStock.size}개 종목 · {matches.length}개 상품</span></div>
      {byStock.size > 0 ? [...byStock].map(([id, products]) => {
        const { stock } = products[0]
        return <article className="topic-company" key={id}>
          <Link className="topic-stock" to={pathFor(id)}><StockMark stock={stock} /><span><strong>{stock.name}</strong><small>{stock.symbol} · {stock.exchange}</small></span><ChevronRight size={17} aria-hidden /></Link>
          {products.map(product => <div className="topic-product" key={product.productId}>
            <div><Link to={'/products/' + product.productId}>{product.productName}</Link>
              <small>{product.market === 'KR' ? '국내' : '미국'} 판매 · {product.detail
                ?? (product.fact ? `${formatFact(product.fact)} · ${bases[product.fact.basis]}` : '')}</small></div>
            <Source href={product.source}>상품 근거</Source>
          </div>)}
        </article>
      }) : <Empty>공개 자료로 확인한 등록 상품이 없습니다.</Empty>}
    </section>
  </>
}
