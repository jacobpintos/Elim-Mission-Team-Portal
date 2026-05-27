import React from 'react'
import { G, Rect, Text } from 'react-native-svg'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function BoxElement({ el }: Props) {
  const w = el.width ?? 120
  const h = el.height ?? 80
  return (
    <G transform={`translate(${el.x}, ${el.y})`}>
      <Rect
        width={w} height={h}
        fill="transparent"
        stroke={el.strokeColor ?? '#e8624a'}
        strokeWidth={el.strokeWidth ?? 2}
        rx={4} ry={4}
      />
      {el.content ? (
        <Text
          x={w / 2} y={h / 2 + (el.fontSize ?? 12) * 0.35}
          textAnchor="middle"
          fill={el.textColor ?? '#f0ece4'}
          fontSize={el.fontSize ?? 12}
          fontFamily="sans-serif"
        >
          {el.content}
        </Text>
      ) : null}
    </G>
  )
}
