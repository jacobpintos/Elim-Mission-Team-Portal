import React from 'react'
import { Image } from 'react-native-svg'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function ImageElement({ el }: Props) {
  if (!el.imageUrl) return null
  return (
    <Image
      x={el.x}
      y={el.y}
      width={el.width ?? 200}
      height={el.height ?? 150}
      href={el.imageUrl}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}
