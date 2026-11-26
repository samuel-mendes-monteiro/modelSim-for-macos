/** Sizes of the project panel (left) and the Transcript (bottom), changed by dragging. */
import { useState } from 'react'

export function useSplitters() {
  const [leftW, setLeftW] = useState(260)
  const [bottomH, setBottomH] = useState(210)

  const drag = (axis: 'x' | 'y') => (e: React.MouseEvent) => {
    e.preventDefault()
    const start = axis === 'x' ? e.clientX : e.clientY
    const init = axis === 'x' ? leftW : bottomH
    const move = (ev: MouseEvent) => {
      if (axis === 'x') setLeftW(Math.min(500, Math.max(160, init + ev.clientX - start)))
      else setBottomH(Math.min(window.innerHeight - 200, Math.max(80, init - (ev.clientY - start))))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return { leftW, bottomH, drag }
}
