import React from 'react'
import { Path } from 'react-native-svg'
import { pointsToSvgPath } from '@/lib/boardUtils'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function PenElement({ el }: Props) {
  const d = pointsToSvgPath(el.points ?? [])
  if (!d) return null
  return (
    <Path
      d={d}
      stroke={el.strokeColor ?? '#f0ece4'}
      strokeWidth={el.strokeWidth ?? 3}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}
