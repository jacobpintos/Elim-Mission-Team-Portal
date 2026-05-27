import React from 'react'
import { G, Rect } from 'react-native-svg'
import { getBoundingBox } from '@/lib/boardUtils'
import type { BoardElement } from '@/types/planning'

interface Props {
  el: BoardElement
  scale: number
}

export default function SelectionOverlay({ el, scale }: Props) {
  const bb = getBoundingBox(el)
  const pad = 4 / scale
  const handleSize = 10 / scale
  const strokeW = 1.5 / scale
  const dash = `${4 / scale} ${3 / scale}`

  const x = bb.x - pad
  const y = bb.y - pad
  const w = bb.w + pad * 2
  const h = bb.h + pad * 2

  const corners = [
    { cx: x,         cy: y },
    { cx: x + w,     cy: y },
    { cx: x,         cy: y + h },
    { cx: x + w,     cy: y + h },
  ]

  return (
    <G>
      <Rect
        x={x} y={y} width={w} height={h}
        fill="none"
        stroke="#87b7e8"
        strokeWidth={strokeW}
        strokeDasharray={dash}
      />
      {corners.map((c, i) => (
        <Rect
          key={i}
          x={c.cx - handleSize / 2}
          y={c.cy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#87b7e8"
          rx={1 / scale}
        />
      ))}
    </G>
  )
}
