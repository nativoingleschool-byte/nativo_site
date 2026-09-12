import React, { useMemo } from 'react'
import { Navigate } from 'react-big-calendar'
// @ts-ignore
import TimeGrid from 'react-big-calendar/lib/TimeGrid'
import { addDays, startOfDay } from 'date-fns'

export default function ThreeDayView(props: any) {
  const { date, localizer } = props
  const currRange = useMemo(() => ThreeDayView.range(date, { localizer }), [date, localizer])

  return <TimeGrid {...props} range={currRange} eventOffset={15} />
}

ThreeDayView.range = (date: Date, { localizer }: any) => {
  const start = startOfDay(date)
  const end = addDays(start, 2)
  
  let current = start
  const range = []
  
  while (localizer.lte(current, end, 'day')) {
    range.push(current)
    current = localizer.add(current, 1, 'day')
  }
  
  return range
}

ThreeDayView.navigate = (date: Date, action: string, { localizer }: any) => {
  switch (action) {
    case Navigate.PREVIOUS:
      return localizer.add(date, -3, 'day')
    case Navigate.NEXT:
      return localizer.add(date, 3, 'day')
    default:
      return date
  }
}

ThreeDayView.title = (date: Date, { localizer }: any) => {
  const [start, ...rest] = ThreeDayView.range(date, { localizer })
  return localizer.format({ start, end: rest.pop() }, 'dayRangeHeaderFormat')
}
