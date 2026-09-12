import React from 'react'

export function customDayLayoutAlgorithm({ events, slotMetrics, accessors }: any) {
  if (!events || events.length === 0) return []

  // 1. Sort by start time, then by duration (longest first)
  const sorted = [...events].sort((a, b) => {
    const aStart = accessors.start(a).getTime()
    const bStart = accessors.start(b).getTime()
    if (aStart !== bStart) return aStart - bStart
    const aDuration = accessors.end(a).getTime() - accessors.start(a).getTime()
    const bDuration = accessors.end(b).getTime() - accessors.start(b).getTime()
    return bDuration - aDuration
  })

  const results: Array<{ event: any; style: React.CSSProperties }> = []
  
  // 2. Group into overlapping clusters
  let currentCluster: any[] = []
  let clusterEnd = 0
  const clusters: any[][] = []

  for (const event of sorted) {
    const start = accessors.start(event).getTime()
    if (currentCluster.length > 0 && start >= clusterEnd) {
      clusters.push(currentCluster)
      currentCluster = []
    }
    currentCluster.push(event)
    clusterEnd = Math.max(clusterEnd, accessors.end(event).getTime())
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  // 3. Layout each cluster
  for (const cluster of clusters) {
    const columns: any[][] = []
    
    for (const event of cluster) {
      let placed = false
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i]
        const lastEvent = column[column.length - 1]
        // If the event starts after or exactly when the last event ends, it doesn't overlap
        if (accessors.end(lastEvent).getTime() <= accessors.start(event).getTime()) {
          column.push(event)
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([event])
      }
    }

    const totalColumns = columns.length
    
    for (let i = 0; i < columns.length; i++) {
      for (const event of columns[i]) {
        const { top, height } = slotMetrics.getRange(accessors.start(event), accessors.end(event))
        
        // Assign each event an appropriate horizontal position and width
        const left = (i / totalColumns) * 100
        const width = (1 / totalColumns) * 100
        
        results.push({
          event,
          style: {
            top: `${top}%`,
            height: `${height}%`,
            left: `${left}%`,
            width: `${width}%`,
            // Enforce a minimum width so text never becomes completely unreadable single letters
            minWidth: totalColumns >= 3 ? '40px' : 'auto',
            position: 'absolute'
          }
        })
      }
    }
  }

  return results
}
