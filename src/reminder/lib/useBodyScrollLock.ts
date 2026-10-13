import { useEffect } from 'react'

type InlineStyleSnapshot = {
  element: HTMLElement
  property: string
  value: string
  priority: string
}

let lockCount = 0
let lockedScrollY = 0
let lockedStyles: InlineStyleSnapshot[] = []

const lockBodyScroll = () => {
  if (lockCount === 0) {
    lockedScrollY = window.scrollY
    const body = document.body
    const root = document.documentElement
    const properties = [
      [root, 'overflow'],
      [body, 'position'],
      [body, 'top'],
      [body, 'left'],
      [body, 'right'],
      [body, 'width'],
      [body, 'overflow'],
    ] as const

    lockedStyles = properties.map(([element, property]) => ({
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }))

    root.style.setProperty('overflow', 'hidden')
    body.style.setProperty('position', 'fixed')
    body.style.setProperty('top', `-${lockedScrollY}px`)
    body.style.setProperty('left', '0')
    body.style.setProperty('right', '0')
    body.style.setProperty('width', '100%')
    body.style.setProperty('overflow', 'hidden')
  }

  lockCount += 1
}

const unlockBodyScroll = () => {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0) return

  for (const { element, property, value, priority } of lockedStyles) {
    if (value) element.style.setProperty(property, value, priority)
    else element.style.removeProperty(property)
  }
  lockedStyles = []
  window.scrollTo(0, lockedScrollY)
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    lockBodyScroll()
    return unlockBodyScroll
  }, [locked])
}
