import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export const categories = {
  RAMEN: '즉석 라면',
  FRYING_PAN: '프라이팬',
  CHICKEN_NOODLE_SOUP: '치킨 누들 수프',
  COLA: '콜라',
  RICE_COOKER: '전기밥솥',
  WATER_FILTER: '정수기·필터',
  AIR_PURIFIER: '공기청정기·필터',
  FROZEN_CHICKEN_NUGGETS: '냉동 치킨너겟',
  PEANUT_BUTTER: '땅콩버터',
  CHOCOLATE: '초콜릿',
  MAC_AND_CHEESE: '맥앤치즈', BEEF_FRANKS: '소고기 소시지',
  CANNED_LUNCHEON_MEAT: '통조림 햄', TOMATO_KETCHUP: '토마토 케첩', BREAKFAST_CEREAL: '시리얼', TOMATO_SOUP: '토마토 수프',
} as const
export const criteria = {
  SODIUM: '나트륨', TOTAL_SUGAR: '당류', ADDED_SUGAR: '첨가당', SATURATED_FAT: '포화지방', CALORIES: '열량',
  AVOID_PTFE: 'PTFE 미사용', AVOID_PFAS: 'PFAS 미사용', AVOID_ASPARTAME: '아스파탐 미사용',
} as const
export const bases: Record<string, string> = { PER_SERVING: '1회 제공량', PER_100ML: '100 mL', PER_100G: '100 g', SURFACE: '조리 접촉면', INGREDIENTS: '원재료' }
export const relations: Record<string, string> = { OWNER: '브랜드 소유', DISTRIBUTOR: '판매·유통', MANUFACTURER: '제조', LICENSEE: '라이선스' }
export type Category = keyof typeof categories
const standardizedFood = new Set<Category>([
  'FROZEN_CHICKEN_NUGGETS', 'PEANUT_BUTTER', 'CHOCOLATE', 'MAC_AND_CHEESE', 'BEEF_FRANKS',
  'CANNED_LUNCHEON_MEAT', 'TOMATO_KETCHUP', 'BREAKFAST_CEREAL',
])
export const nutritionBasis = (category: Category) => category === 'COLA' ? 'PER_100ML' : standardizedFood.has(category) ? 'PER_100G' : 'PER_SERVING'
export type Criterion = keyof typeof criteria
export type Stock = { id: string; symbol: string; name: string; english: string; market: string; exchange: string; currency: string; overview: string; source: string }
export type Fact = { criterion: Criterion; value: number; unit: string; basis: string; source: string }
export type HealthTopic = { id: string; name: string; category: string; aliases: string[]; assessment: string; sources: { title: string; url: string }[] }
export type Product = {
  id: string; symbol: string; name: string; brand: string; category: Category; market: string;
  relation: string; size: string; prep: string; source: string; facts: Fact[];
  evidence: { title: string; summary: string; source: string; topic?: string }[]; material: string | null; description: string
}
export type Quote = { listingId: string; price: number | null; change: number | null; changePercent: number | null; cumulativeVolume: number; currency: string; exchangeTimestamp: string | null; receivedAt: string | null; feedMode: string; freshness: string; session: string }
export type Candle = { startAt: string; open: number; high: number; low: number; close: number; volume: number }
export type MarketIndex = { code: 'KOSPI' | 'KOSDAQ' | 'SPX' | 'COMP'; value: number; change: number; changePercent: number; observedAt: string; points: { at: string; value: number }[] }
export type Comparison = { stock: Stock; products: Product[] }
export type Match = { product: Product; stock: Stock; fact: Fact; reductionPercent?: number | null }

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let result: Response
  try { result = await fetch('/api/v1' + path, options) }
  catch (error) {
    if (options?.signal?.aborted) throw error
    throw new ApiError('연결이 원활하지 않습니다. 잠시 후 다시 확인해 주세요.', 503)
  }
  if (!result.ok) {
    const error = await result.json().catch(() => null)
    throw new ApiError(typeof error?.message === 'string' ? error.message : '정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.', result.status)
  }
  return result.json().catch(() => { throw new ApiError('정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.', 502) })
}
export const pathFor = (id: string) => '/stocks/' + encodeURIComponent(id)
export function useData<T>(path: string, enabled = true, refetchInterval?: number) {
  const isChart = path.startsWith('/market/stocks/')
  return useQuery({
    queryKey: [path], queryFn: ({ signal }) => api<T>(path, { signal }), enabled, refetchInterval,
    retry: (failures, error) => failures < (error instanceof ApiError &&
      (error.status === 429 || (isChart && [502, 503, 504].includes(error.status))) ? 3 : 1),
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000),
  })
}
export function useMarketMode() {
  return useData<{ feedMode: string }>('/market/mode').data?.feedMode
}
export const quoteTime = (quote: Quote) => quote.exchangeTimestamp ?? quote.receivedAt
export function quoteStatus(quote: Quote) {
  if (quote.feedMode === 'REPLAY') return '시연용 시세'
  if (quote.freshness === 'STALE') return '시세 지연'
  if (quote.session === 'REGULAR') return '정규장'
  return quote.session === 'CLOSED' ? '장 마감' : '시세 기준'
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
  const quotes = result.data ?? []
  const pending = Boolean(selection) && (result.isPending || result.isFetching)
  return { getQuote: (id: string) => quotes.find(quote => quote.listingId === id) ?? (pending ? undefined : null) }
}

export const currency = (value: number, code: string) =>
  code === 'KRW' ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value) + '원'
    : new Intl.NumberFormat('ko-KR', { style: 'currency', currency: code }).format(value)
export const percent = (value: number) => (value > 0 ? '+' : '') + value.toFixed(2) + '%'
export const tone = (value: number) => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
export const formatFact = (fact: Fact) => fact.criterion.startsWith('AVOID_')
  ? (fact.value === 0 ? '미사용 확인' : '사용 확인') : fact.value.toLocaleString('ko-KR') + ' ' + fact.unit
