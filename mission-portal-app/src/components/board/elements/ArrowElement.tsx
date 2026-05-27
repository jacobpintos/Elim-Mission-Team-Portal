import React from 'react'
import { G, Line, Polygon } from 'react-native-svg'
import { arrowheadPoints } from '@/lib/boardUtils'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function ArrowElement({ el }: Props) {
  const x2 = el.x2 ?? el.x + 80
  const y2 = el.y2 ?? el.y
  const angle = Math.atan2(y2 - el.y, x2 - el.x)
  const color = el.strokeColor ?? '#f0ece4'
  const sw = el.strokeWidth ?? 2

  return (
    <G>
      <Line
        x1={el.x} y1={el.y} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <Polygon
        points={arrowheadPoints(x2, y2, angle, 12)}
        fill={color}
      />
    </G>
  )
}
