import { useEffect, useRef } from 'react'
import { AreaSeries, CandlestickSeries, ColorType, HistogramSeries, createChart } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from './api'

const toTime = (bar: Candle) => Math.floor(new Date(bar.startAt).getTime() / 1000) as UTCTimestamp
const pricePoint = (bar: Candle) => ({ ...bar, time: toTime(bar), value: bar.close })
const volumePoint = (bar: Candle) => ({ time: toTime(bar), value: bar.volume, color: bar.close >= bar.open ? '#eb9fa8' : '#a4b9e2' })

function sameBar(left: Candle, right: Candle) {
  return left.startAt === right.startAt && left.open === right.open && left.high === right.high
    && left.low === right.low && left.close === right.close && left.volume === right.volume
}

export default function Chart({ bars, candle, market, daily = false }: {
  bars: Candle[]; candle: boolean; market: string; daily?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const applyBars = useRef<((next: Candle[]) => void) | null>(null)

  useEffect(() => {
    if (!host.current) return
    const zone = market === 'KR' ? 'Asia/Seoul' : 'America/New_York'
    const localTime = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const localDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
    const label = (time: number) => (daily ? localDate : localTime).format(time * 1000)
    const digits = market === 'KR' ? 0 : 2
    const price = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#fff' }, textColor: '#51636a', fontFamily: getComputedStyle(host.current).fontFamily, attributionLogo: true },
      grid: { vertLines: { color: '#f0f4f3' }, horzLines: { color: '#edf2f1' } },
      timeScale: { timeVisible: !daily, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: label },
      localization: { timeFormatter: label, priceFormatter: price.format },
    })
    const series = candle ? chart.addSeries(CandlestickSeries, {
      upColor: '#e24956', downColor: '#4678c6', borderVisible: false, wickUpColor: '#e24956', wickDownColor: '#4678c6',
    }) : chart.addSeries(AreaSeries, {
      lineColor: '#087968', topColor: '#76d4b780', bottomColor: '#def7ef20', lineWidth: 2,
    })
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.12, bottom: 0.3 } })

    let previous: Candle[] = []
    const timeScale = chart.timeScale()
    applyBars.current = next => {
      const first = next[0]
      const sameStart = first && previous[0]?.startAt === first.startAt
      const priorRange = timeScale.getVisibleLogicalRange()
      const followLatest = !priorRange || priorRange.to >= previous.length - 1.5
      const stablePrefix = sameStart && next.length >= previous.length
        && previous.slice(0, -1).every((bar, index) => sameBar(bar, next[index]))
        && next[previous.length - 1]?.startAt === previous[previous.length - 1].startAt

      // 마지막 봉만 갱신할 때 차트 인스턴스와 사용자의 조회 범위를 보존
      if (stablePrefix) {
        for (let index = previous.length - 1; index < next.length; index++) {
          const bar = next[index]
          if (index < previous.length && sameBar(previous[index], bar)) continue
          series.update(pricePoint(bar))
          volume.update(volumePoint(bar))
        }
        if (followLatest && next.length > previous.length) timeScale.scrollToRealTime()
      } else {
        series.setData(next.map(pricePoint))
        volume.setData(next.map(volumePoint))
        if (!sameStart || !priorRange) timeScale.fitContent()
        else if (!followLatest) timeScale.setVisibleLogicalRange(priorRange)
        else timeScale.scrollToRealTime()
      }
      previous = next
    }

    return () => {
      applyBars.current = null
      chart.remove()
    }
  }, [candle, market, daily])

  useEffect(() => { applyBars.current?.(bars) }, [bars, candle, market, daily])
  return <div className="price-chart" ref={host} role="img" aria-label="시세 및 거래량 차트" />
}
