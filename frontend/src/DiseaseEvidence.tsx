import { bases, formatFact } from './api'
import type { HealthAssessment, HealthTopic } from './api'
import { Source } from './ui'

export function DiseaseEvidence({ topic }: { topic: HealthTopic }) {
  return <div className="disease-evidence">
    <p><strong>관련 질환</strong> {topic.condition}</p>
    <p>{topic.assessment}</p>
    <ul aria-label="연구·기관 근거">{topic.sources.map(source => <li key={source.url}>
      <p>{source.finding}</p><Source href={source.url}>{source.title}</Source>
    </li>)}</ul>
  </div>
}

export function ProductDiseaseEvidence({ assessment: { topic, support } }: { assessment: HealthAssessment }) {
  const title = topic.name + ' 건강 이슈'
  return <section className="health-topic" aria-label={title}>
    <header><h3>{title}</h3><small>{topic.category}</small></header>
    <p>{support.detail ?? (support.fact && [formatFact(support.fact), bases[support.fact.basis]].join(' · '))}
      {' '}<Source href={support.source}>상품 근거</Source></p>
    <DiseaseEvidence topic={topic} />
  </section>
}
