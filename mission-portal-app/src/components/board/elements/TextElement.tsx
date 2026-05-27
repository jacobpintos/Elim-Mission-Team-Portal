import React from 'react'
import { G, Text } from 'react-native-svg'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function TextElement({ el }: Props) {
  return (
    <G transform={`translate(${el.x}, ${el.y})`}>
      <Text
        fill={el.textColor ?? '#f0ece4'}
        fontSize={el.fontSize ?? 14}
        fontWeight="500"
        fontFamily="sans-serif"
      >
        {el.content ?? ''}
      </Text>
    </G>
  )
}
