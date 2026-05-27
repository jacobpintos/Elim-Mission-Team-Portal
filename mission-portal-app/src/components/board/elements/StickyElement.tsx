import React from 'react'
import { Platform } from 'react-native'
import { G, Rect, Text, ForeignObject } from 'react-native-svg'
import type { BoardElement } from '@/types/planning'

interface Props { el: BoardElement }

export default function StickyElement({ el }: Props) {
  const w = el.width ?? 160
  const h = el.height ?? 120
  const bg = el.bgColor ?? '#fffde7'
  const textCol = el.textColor ?? '#333333'
  const fs = el.fontSize ?? 13
  const content = el.content ?? ''

  if (Platform.OS === 'web') {
    return (
      <G transform={`translate(${el.x}, ${el.y})`}>
        <Rect width={w} height={h} fill={bg} rx={6} ry={6} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
        <ForeignObject x={8} y={8} width={w - 16} height={h - 16}>
          {/* @ts-ignore – ForeignObject body is HTML on web */}
          <div style={{ fontSize: fs, color: textCol, wordBreak: 'break-word', lineHeight: 1.4, overflow: 'hidden', height: '100%' }}>
            {content}
          </div>
        </ForeignObject>
      </G>
    )
  }

  // Native: manual line-wrap
  const lineHeight = fs * 1.4
  const lines = wrapText(content, w - 16, fs)
  return (
    <G transform={`translate(${el.x}, ${el.y})`}>
      <Rect width={w} height={h} fill={bg} rx={6} ry={6} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
      {lines.slice(0, Math.floor((h - 16) / lineHeight)).map((line, i) => (
        <Text
          key={i}
          x={8}
          y={16 + i * lineHeight}
          fill={textCol}
          fontSize={fs}
          fontFamily="sans-serif"
        >
          {line}
        </Text>
      ))}
    </G>
  )
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.55
  const charsPerLine = Math.max(1, Math.floor(maxWidth / charWidth))
  const lines: string[] = []
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue }
    let current = ''
    for (const word of para.split(' ')) {
      const test = current ? `${current} ${word}` : word
      if (test.length <= charsPerLine) {
        current = test
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
