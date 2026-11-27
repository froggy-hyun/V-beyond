import { useEffect, useRef } from 'react'
import { AreaSeries, CandlestickSeries, ColorType, HistogramSeries, createChart } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import type { Candle } from './api'

export default function Chart({ bars, candle, market }: { bars: Candle[]; candle: boolean; market: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current || !bars.length) return
    const zone = market === 'KR' ? 'Asia/Seoul' : 'America/New_York'
    const localTime = new Intl.DateTimeFormat('ko-KR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const localDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
    const daily = new Date(bars[1]?.startAt ?? bars[0].startAt).getTime() - new Date(bars[0].startAt).getTime() >= 86_400_000
    const label = (time: number) => (daily ? localDate : localTime).format(time * 1000)
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#fff' }, textColor: '#51636a', attributionLogo: true },
      grid: { vertLines: { color: '#f0f4f3' }, horzLines: { color: '#edf2f1' } },
      timeScale: { timeVisible: !daily, secondsVisible: false, tickMarkFormatter: label },
      localization: { timeFormatter: label },
    })
    const points = bars.map(bar => ({ ...bar, time: Math.floor(new Date(bar.startAt).getTime() / 1000) as UTCTimestamp }))
    if (candle) {
      chart.addSeries(CandlestickSeries, {
        upColor: '#e24956', downColor: '#4678c6', borderVisible: false, wickUpColor: '#e24956', wickDownColor: '#4678c6',
      }).setData(points)
    } else {
      chart.addSeries(AreaSeries, { lineColor: '#087968', topColor: '#76d4b780', bottomColor: '#def7ef20', lineWidth: 2 })
        .setData(points.map(bar => ({ time: bar.time, value: bar.close })))
    }
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    volume.setData(points.map(bar => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? '#eb9fa8' : '#a4b9e2' })))
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.12, bottom: 0.3 } })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [bars, candle, market])
  return <div className="price-chart" ref={host} role="img" aria-label="시세 및 거래량 차트" />
}
