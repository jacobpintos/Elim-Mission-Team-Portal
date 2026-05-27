import React from 'react'
import { G, Circle, Polygon, Text } from 'react-native-svg'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function PinElement({ el }: Props) {
  const color = el.pinColor ?? '#e8624a'
  return (
    <G transform={`translate(${el.x}, ${el.y})`}>
      <Circle cx={0} cy={-8} r={8} fill={color} />
      <Polygon points="0,4 -5,-4 5,-4" fill={color} />
      {el.content ? (
        <Text
          y={18}
          textAnchor="middle"
          fontSize={11}
          fill={el.textColor ?? '#f0ece4'}
          fontFamily="sans-serif"
        >
          {el.content}
        </Text>
      ) : null}
    </G>
  )
}
