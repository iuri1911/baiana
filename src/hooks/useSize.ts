import { useLayoutEffect, useState, type RefObject } from 'react'

/** Tamanho em px de um elemento, acompanhando redimensionamento e rotacao. */
export function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height },
      )
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])

  return size
}
