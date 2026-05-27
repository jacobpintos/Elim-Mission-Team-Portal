import type { BoardElement } from '@/types/planning'

export function rdpDecimate(points: number[][], epsilon: number): number[][] {
  if (points.length <= 2) return points
  let maxDist = 0
  let maxIdx  = 0
  const first = points[0]
  const last  = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) { maxDist = dist; maxIdx = i }
  }
  if (maxDist > epsilon) {
    const left  = rdpDecimate(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpDecimate(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function perpendicularDistance(pt: number[], line0: number[], line1: number[]): number {
  const dx = line1[0] - line0[0]
  const dy = line1[1] - line0[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((pt[0]-line0[0])**2 + (pt[1]-line0[1])**2)
  return Math.abs(dy * pt[0] - dx * pt[1] + line1[0] * line0[1] - line1[1] * line0[0]) / len
}

export function pointsToSvgPath(points: number[][]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i+1][0]) / 2
    const my = (points[i][1] + points[i+1][1]) / 2
    d += ` Q ${points[i][0]} ${points[i][1]} ${mx} ${my}`
  }
  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

export function getBoundingBox(el: BoardElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'sticky': return { x: el.x, y: el.y, w: el.width ?? 160, h: el.height ?? 120 }
    case 'text':   return { x: el.x - 4, y: el.y - 14, w: (el.content?.length ?? 10) * (el.fontSize ?? 14) * 0.6, h: (el.fontSize ?? 14) * 1.4 }
    case 'box':    return { x: el.x, y: el.y, w: el.width ?? 120, h: el.height ?? 80 }
    case 'arrow':  return { x: Math.min(el.x, el.x2 ?? el.x) - 8, y: Math.min(el.y, el.y2 ?? el.y) - 8, w: Math.abs((el.x2 ?? el.x) - el.x) + 16, h: Math.abs((el.y2 ?? el.y) - el.y) + 16 }
    case 'pin':    return { x: el.x - 10, y: el.y - 20, w: 20, h: 30 }
    case 'pen':    return penBoundingBox(el.points ?? [])
    case 'image':  return { x: el.x, y: el.y, w: el.width ?? 200, h: el.height ?? 150 }
    default:       return { x: el.x, y: el.y, w: 20, h: 20 }
  }
}

function penBoundingBox(points: number[][]): { x: number; y: number; w: number; h: number } {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 }
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8
  const minY = Math.min(...ys) - 8, maxY = Math.max(...ys) + 8
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function hitTest(canvasX: number, canvasY: number, el: BoardElement): boolean {
  const bb = getBoundingBox(el)
  return canvasX >= bb.x && canvasX <= bb.x + bb.w
      && canvasY >= bb.y && canvasY <= bb.y + bb.h
}

export function screenToCanvas(
  screenX: number,
  screenY: number,
  translateX: number,
  translateY: number,
  scale: number
): { x: number; y: number } {
  return {
    x: (screenX - translateX) / scale,
    y: (screenY - translateY) / scale,
  }
}

export function arrowheadPoints(x2: number, y2: number, angle: number, headLen: number): string {
  const a1 = angle - Math.PI / 6
  const a2 = angle + Math.PI / 6
  const p1x = x2 - headLen * Math.cos(a1)
  const p1y = y2 - headLen * Math.sin(a1)
  const p2x = x2 - headLen * Math.cos(a2)
  const p2y = y2 - headLen * Math.sin(a2)
  return `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
