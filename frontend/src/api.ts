import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export const categories = {
  RAMEN: '즉석 라면',
  FRYING_PAN: '프라이팬',
  CHICKEN_NOODLE_SOUP: '치킨 누들 수프',
  COLA: '콜라',
} as const
export const criteria = {
  SODIUM: '나트륨', TOTAL_SUGAR: '당류', ADDED_SUGAR: '첨가당', SATURATED_FAT: '포화지방', CALORIES: '열량',
  AVOID_PTFE: 'PTFE 미사용', AVOID_PFAS: 'PFAS 미사용', AVOID_ASPARTAME: '아스파탐 미사용',
} as const
export const bases: Record<string, string> = { PER_SERVING: '1회 제공량', PER_100ML: '100 mL', SURFACE: '조리 접촉면', INGREDIENTS: '원재료' }
export const relations: Record<string, string> = { OWNER: '브랜드 소유', DISTRIBUTOR: '판매·유통', MANUFACTURER: '제조', LICENSEE: '라이선스' }
export type Category = keyof typeof categories
export type Criterion = keyof typeof criteria
export type Stock = { id: string; symbol: string; name: string; english: string; market: string; exchange: string; currency: string; overview: string; source: string }
export type Fact = { criterion: Criterion; value: number; unit: string; basis: string; source: string }
export type Product = {
  id: string; symbol: string; name: string; brand: string; category: Category; market: string;
  relation: string; size: string; prep: string; source: string; facts: Fact[];
  evidence: { title: string; summary: string; source: string }[]; material: string | null; description: string
}
export type Quote = { listingId: string; price: number | null; change: number | null; changePercent: number | null; cumulativeVolume: number; currency: string; exchangeTimestamp: string | null; receivedAt: string | null; feedMode: string; freshness: string; session: string }
export type Candle = { startAt: string; open: number; high: number; low: number; close: number; volume: number }
export type Comparison = { stock: Stock; products: Product[] }
export type Match = { product: Product; stock: Stock; fact: Fact; reductionPercent?: number | null }

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await fetch('/api/v1' + path, options)
  if (!result.ok) {
    const error = await result.json().catch(() => null)
    throw new Error(error?.message || '데이터를 불러올 수 없습니다.')
  }
  return result.json()
}
export const pathFor = (id: string) => '/stocks/' + encodeURIComponent(id)
export function useData<T>(path: string, enabled = true, refetchInterval?: number) {
  return useQuery({ queryKey: [path], queryFn: ({ signal }) => api<T>(path, { signal }), enabled, refetchInterval })
}
export function useMarketMode() {
  return useData<{ feedMode: string }>('/market/mode').data?.feedMode
}
export const quoteTime = (quote: Quote) => quote.exchangeTimestamp ?? quote.receivedAt
export function quoteStatus(quote: Quote) {
  if (quote.feedMode === 'REPLAY') return '데모 · 장 마감'
  if (quote.freshness === 'UNAVAILABLE') return '시세 확인 불가'
  if (quote.freshness === 'STALE') return '갱신 지연'
  if (quote.session === 'REGULAR') return '정규장 · 주기 갱신'
  return quote.session === 'CLOSED' ? '정규장 마감' : 'KIS 조회'
}
export function useQuotes(ids: string[]) {
  const queryClient = useQueryClient()
  const selection = ids.map(encodeURIComponent).join(',')
  const path = '/market/quotes?ids=' + selection
  const result = useData<Quote[]>(path, Boolean(selection))
  useEffect(() => {
    if (!selection) return
    const connection = new EventSource('/api/v1/market/stream?ids=' + selection)
    connection.addEventListener('quote', (event) => {
      const quote: Quote = JSON.parse(event.data)
      queryClient.setQueryData<Quote[]>([path], (old = []) => {
        const existing = old.find(item => item.listingId === quote.listingId)
        if (existing && (Date.parse(quoteTime(existing) ?? '') || 0) > (Date.parse(quoteTime(quote) ?? '') || 0)) return old
        return [...old.filter(item => item.listingId !== quote.listingId), quote]
      })
    })
    connection.addEventListener('resync-required', () => void queryClient.invalidateQueries({ queryKey: [path] }))
    return () => connection.close()
  }, [selection, path, queryClient])
  return result.data ?? []
}

export const currency = (value: number, code: string) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: code }).format(value)
export const percent = (value: number) => (value > 0 ? '+' : '') + value.toFixed(2) + '%'
export const tone = (value: number) => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
export const formatFact = (fact: Fact) => fact.criterion.startsWith('AVOID_')
  ? (fact.value === 0 ? '미사용 확인' : '사용 확인') : fact.value.toLocaleString('ko-KR') + ' ' + fact.unit
