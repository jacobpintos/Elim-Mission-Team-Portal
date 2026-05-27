import React, {
  useEffect, useRef, useState, useCallback,
} from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  TextInput, Dimensions, Platform,
} from 'react-native'
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS,
} from 'react-native-reanimated'
import Svg, { G } from 'react-native-svg'
import { useAuthStore } from '@/stores/authStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useFileUpload } from '@/hooks/useFileUpload'
import { hitTest, screenToCanvas, rdpDecimate, clamp, getBoundingBox } from '@/lib/boardUtils'
import BoardToolbar, { type Tool } from '@/components/board/BoardToolbar'
import StickyElement from '@/components/board/elements/StickyElement'
import TextElement from '@/components/board/elements/TextElement'
import BoxElement from '@/components/board/elements/BoxElement'
import ArrowElement from '@/components/board/elements/ArrowElement'
import PinElement from '@/components/board/elements/PinElement'
import PenElement from '@/components/board/elements/PenElement'
import ImageElement from '@/components/board/elements/ImageElement'
import SelectionOverlay from '@/components/board/SelectionOverlay'
import type { BoardElement } from '@/types/planning'

const CANVAS_SIZE = 4000

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

interface Props {
  boardId: number
  onClose: () => void
}

export default function PlanningBoardCanvas({ boardId, onClose }: Props) {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const store = usePlanningStore()
  const { pickAndUpload } = useFileUpload()

  // ── Viewport (reanimated shared values — updated on UI thread) ──
  const { width: screenW, height: screenH } = Dimensions.get('window')
  const initialTx = (screenW - CANVAS_SIZE * 0.25) / 2
  const initialTy = (screenH - CANVAS_SIZE * 0.25) / 2
  const translateX = useSharedValue(initialTx)
  const translateY = useSharedValue(initialTy)
  const scale      = useSharedValue(0.25)
  const savedTx    = useSharedValue(initialTx)
  const savedTy    = useSharedValue(initialTy)
  const savedScale = useSharedValue(0.25)

  // ── Tool & style state ──
  const [activeTool, setActiveTool]   = useState<Tool>('select')
  const [strokeColor, setStrokeColor] = useState('#e8624a')
  const [stickyColor, setStickyColor] = useState('#fffde7')
  const [strokeWidth, setStrokeWidth] = useState(2)

  // ── Selection & editing ──
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [editTextEl, setEditTextEl]       = useState<BoardElement | null>(null)
  const [editTextValue, setEditTextValue] = useState('')

  // ── Live drawing preview ──
  const [previewEl, setPreviewEl] = useState<BoardElement | null>(null)

  // ── Refs for gesture callbacks (avoid stale closures) ──
  const activeToolRef    = useRef<Tool>('select')
  const strokeColorRef   = useRef('#e8624a')
  const stickyColorRef   = useRef('#fffde7')
  const strokeWidthRef   = useRef(2)
  const selectedIdRef    = useRef<string | null>(null)

  // sync refs
  useEffect(() => { activeToolRef.current    = activeTool   }, [activeTool])
  useEffect(() => { strokeColorRef.current   = strokeColor  }, [strokeColor])
  useEffect(() => { stickyColorRef.current   = stickyColor  }, [stickyColor])
  useEffect(() => { strokeWidthRef.current   = strokeWidth  }, [strokeWidth])
  useEffect(() => { selectedIdRef.current    = selectedId   }, [selectedId])

  // ── Per-gesture ephemeral refs ──
  const penPointsRef       = useRef<number[][]>([])
  const drawStartRef       = useRef<{ cx: number; cy: number } | null>(null)
  const elemDragStartRef   = useRef<{ touchCx: number; touchCy: number; elX: number; elY: number } | null>(null)
  const debounceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef         = useRef<{ id: string; ts: number } | null>(null)
  // For optimistic element position during drag
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)

  // Board data
  const board    = store.boards.find(b => b.id === boardId)
  const elements: BoardElement[] = store.elements[boardId] ?? []

  useEffect(() => {
    store.subscribeBoard(boardId)
    return () => { store.unsubscribeBoard(boardId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  // ── Animated canvas style ──
  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  // ── Helper: get VP values (JS thread) ──
  const getVP = () => ({
    tx: translateX.value,
    ty: translateY.value,
    sc: scale.value,
  })

  // ── Viewport pan (2-finger or pan tool) ──
  const viewportPanGesture = Gesture.Pan()
    .minPointers(activeTool === 'pan' ? 1 : 2)
    .onStart(() => {
      savedTx.value = translateX.value
      savedTy.value = translateY.value
    })
    .onUpdate(e => {
      translateX.value = savedTx.value + e.translationX
      translateY.value = savedTy.value + e.translationY
    })

  // ── Pinch zoom (always active) ──
  const pinchGesture = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value })
    .onUpdate(e => {
      scale.value = clamp(savedScale.value * e.scale, 0.15, 4.0)
    })

  // ── Tap (placement + selection) ──
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(e => {
      const vp = getVP()
      const cp = screenToCanvas(e.x, e.y, vp.tx, vp.ty, vp.sc)
      runOnJS(handleTap)(cp.x, cp.y)
    })

  // ── Draw / drag (1-finger, context-dependent) ──
  const drawGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(activeToolRef.current === 'pen' ? 0 : 4)
    .onStart(e => {
      const vp = getVP()
      const cp = screenToCanvas(e.x, e.y, vp.tx, vp.ty, vp.sc)
      runOnJS(handleDrawStart)(cp.x, cp.y)
    })
    .onUpdate(e => {
      const vp = getVP()
      const cp = screenToCanvas(e.x, e.y, vp.tx, vp.ty, vp.sc)
      runOnJS(handleDrawUpdate)(cp.x, cp.y)
    })
    .onEnd(e => {
      const vp = getVP()
      const cp = screenToCanvas(e.x, e.y, vp.tx, vp.ty, vp.sc)
      runOnJS(handleDrawEnd)(cp.x, cp.y)
    })

  // Combine: tap + (draw races pan) + pinch
  const mainGesture = Gesture.Simultaneous(
    Gesture.Race(
      drawGesture,
      Gesture.Race(tapGesture, viewportPanGesture)
    ),
    pinchGesture
  )

  // ── Tap handler ──
  const handleTap = useCallback(async (cx: number, cy: number) => {
    const uid    = profile?.uid ?? ''
    const tool   = activeToolRef.current
    const sColor = strokeColorRef.current
    const stColor = stickyColorRef.current

    if (tool === 'sticky') {
      const el: BoardElement = {
        id: genId(), type: 'sticky',
        x: cx - 80, y: cy - 60,
        width: 160, height: 120,
        bgColor: stColor, textColor: '#333333', fontSize: 13,
        content: 'New note',
        zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
      }
      await store.upsertElement(boardId, el)
      return
    }
    if (tool === 'text') {
      const el: BoardElement = {
        id: genId(), type: 'text',
        x: cx, y: cy,
        content: 'Text',
        textColor: '#f0ece4', fontSize: 14,
        zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
      }
      await store.upsertElement(boardId, el)
      return
    }
    if (tool === 'pin') {
      const el: BoardElement = {
        id: genId(), type: 'pin',
        x: cx, y: cy,
        pinColor: sColor,
        zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
      }
      await store.upsertElement(boardId, el)
      return
    }
    if (tool === 'image') {
      const attachment = await pickAndUpload()
      if (!attachment) return
      const el: BoardElement = {
        id: genId(), type: 'image',
        x: cx - 100, y: cy - 75,
        width: 200, height: 150,
        imageUrl: attachment.url,
        zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
      }
      await store.upsertElement(boardId, el)
      return
    }
    if (tool === 'select') {
      const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
      const hit = sorted.find(el => hitTest(cx, cy, el))
      if (hit) {
        const now = Date.now()
        if (lastTapRef.current?.id === hit.id && now - lastTapRef.current.ts < 400) {
          lastTapRef.current = null
          if (['sticky', 'text', 'box'].includes(hit.type)) {
            setEditTextEl(hit)
            setEditTextValue(hit.content ?? '')
          }
          return
        }
        lastTapRef.current = { id: hit.id, ts: now }
        setSelectedId(hit.id)
      } else {
        setSelectedId(null)
        lastTapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, elements, pickAndUpload, profile?.uid])

  // ── Draw start ──
  const handleDrawStart = useCallback((cx: number, cy: number) => {
    const tool = activeToolRef.current

    if (tool === 'pen') {
      penPointsRef.current = [[cx, cy]]
      setPreviewEl({
        id: '__pen_preview__', type: 'pen',
        x: 0, y: 0,
        points: [[cx, cy]],
        strokeColor: strokeColorRef.current,
        strokeWidth: strokeWidthRef.current,
        zIndex: 999999, createdBy: '', updatedAt: Date.now(),
      })
      return
    }

    if (tool === 'box' || tool === 'arrow') {
      drawStartRef.current = { cx, cy }
      return
    }

    if (tool === 'select') {
      const selId = selectedIdRef.current
      const selected = elements.find(e => e.id === selId)
      if (selected && hitTest(cx, cy, selected)) {
        elemDragStartRef.current = {
          touchCx: cx, touchCy: cy,
          elX: selected.x, elY: selected.y,
        }
        setDragOffset({ x: selected.x, y: selected.y })
      } else {
        elemDragStartRef.current = null
        // Hit test for a new selection
        const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
        const hit = sorted.find(el => hitTest(cx, cy, el))
        if (hit) setSelectedId(hit.id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements])

  // ── Draw update ──
  const handleDrawUpdate = useCallback((cx: number, cy: number) => {
    const tool = activeToolRef.current

    if (tool === 'pen') {
      penPointsRef.current = [...penPointsRef.current, [cx, cy]]
      setPreviewEl(p => p ? { ...p, points: [...penPointsRef.current] } : null)
      return
    }

    if ((tool === 'box' || tool === 'arrow') && drawStartRef.current) {
      const { cx: sx, cy: sy } = drawStartRef.current
      if (tool === 'box') {
        setPreviewEl({
          id: '__preview__', type: 'box',
          x: Math.min(sx, cx), y: Math.min(sy, cy),
          width: Math.abs(cx - sx), height: Math.abs(cy - sy),
          strokeColor: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          zIndex: 999999, createdBy: '', updatedAt: Date.now(),
        })
      } else {
        setPreviewEl({
          id: '__preview__', type: 'arrow',
          x: sx, y: sy, x2: cx, y2: cy,
          strokeColor: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          zIndex: 999999, createdBy: '', updatedAt: Date.now(),
        })
      }
      return
    }

    if (tool === 'select' && elemDragStartRef.current && selectedIdRef.current) {
      const { touchCx, touchCy, elX, elY } = elemDragStartRef.current
      const newX = elX + (cx - touchCx)
      const newY = elY + (cy - touchCy)
      // Optimistic UI update
      setDragOffset({ x: newX, y: newY })
      // Debounced Firestore write
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      const id = selectedIdRef.current
      debounceTimerRef.current = setTimeout(async () => {
        const el = (store.elements[boardId] ?? []).find(e => e.id === id)
        if (!el) return
        await store.upsertElement(boardId, { ...el, x: newX, y: newY, updatedAt: Date.now() })
      }, 500)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  // ── Draw end ──
  const handleDrawEnd = useCallback(async (cx: number, cy: number) => {
    const uid  = profile?.uid ?? ''
    const tool = activeToolRef.current

    setPreviewEl(null)

    if (tool === 'pen') {
      const raw = [...penPointsRef.current, [cx, cy]]
      penPointsRef.current = []
      if (raw.length < 2) return
      const decimated = rdpDecimate(raw, 3.0)
      const el: BoardElement = {
        id: genId(), type: 'pen',
        x: 0, y: 0, points: decimated,
        strokeColor: strokeColorRef.current,
        strokeWidth: strokeWidthRef.current,
        zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
      }
      await store.upsertElement(boardId, el)
      return
    }

    if ((tool === 'box' || tool === 'arrow') && drawStartRef.current) {
      const { cx: sx, cy: sy } = drawStartRef.current
      drawStartRef.current = null
      const minLen = 8

      if (tool === 'box') {
        const w = Math.abs(cx - sx), h = Math.abs(cy - sy)
        if (w < minLen || h < minLen) return
        const el: BoardElement = {
          id: genId(), type: 'box',
          x: Math.min(sx, cx), y: Math.min(sy, cy),
          width: w, height: h,
          strokeColor: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
        }
        await store.upsertElement(boardId, el)
      } else {
        const dx = cx - sx, dy = cy - sy
        if (Math.sqrt(dx * dx + dy * dy) < minLen) return
        const el: BoardElement = {
          id: genId(), type: 'arrow',
          x: sx, y: sy, x2: cx, y2: cy,
          strokeColor: strokeColorRef.current,
          strokeWidth: strokeWidthRef.current,
          zIndex: Date.now(), createdBy: uid, updatedAt: Date.now(),
        }
        await store.upsertElement(boardId, el)
      }
      return
    }

    if (tool === 'select') {
      elemDragStartRef.current = null
      setDragOffset(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, profile?.uid])

  // ── Delete selected ──
  const handleDeleteSelected = useCallback(async () => {
    if (!selectedId) return
    await store.deleteElement(boardId, selectedId)
    setSelectedId(null)
    setDragOffset(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, selectedId])

  // ── Save inline text edit ──
  const handleSaveText = async () => {
    if (!editTextEl) return
    await store.upsertElement(boardId, { ...editTextEl, content: editTextValue, updatedAt: Date.now() })
    setEditTextEl(null)
  }

  // ── Render element ──
  const renderElement = (el: BoardElement) => {
    const isSelected = el.id === selectedId
    // Apply optimistic drag offset
    const displayEl = (isSelected && dragOffset)
      ? { ...el, x: dragOffset.x, y: dragOffset.y }
      : el

    let node: React.ReactNode = null
    switch (displayEl.type) {
      case 'sticky': node = <StickyElement el={displayEl} />; break
      case 'text':   node = <TextElement   el={displayEl} />; break
      case 'box':    node = <BoxElement    el={displayEl} />; break
      case 'arrow':  node = <ArrowElement  el={displayEl} />; break
      case 'pin':    node = <PinElement    el={displayEl} />; break
      case 'pen':    node = <PenElement    el={displayEl} />; break
      case 'image':  node = <ImageElement  el={displayEl} />; break
    }
    return (
      <G key={displayEl.id}>
        {node}
        {isSelected && <SelectionOverlay el={displayEl} scale={scale.value} />}
      </G>
    )
  }

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        {/* Header */}
        <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[st.boardName, { color: colors.text }]} numberOfLines={1}>
            {board?.name ?? 'Planning Board'}
          </Text>
          <TouchableOpacity style={st.closeBtn} onPress={onClose}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Close</Text>
          </TouchableOpacity>
        </View>

        {/* Canvas */}
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <GestureDetector gesture={mainGesture}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: CANVAS_SIZE,
                  height: CANVAS_SIZE,
                  left: 0, top: 0,
                },
                canvasAnimStyle,
              ]}
            >
              <Svg
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{ backgroundColor: '#1a1a2e' }}
              >
                {sortedElements.map(renderElement)}
                {previewEl && renderElement(previewEl)}
              </Svg>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Toolbar */}
        <BoardToolbar
          activeTool={activeTool}
          onChangeTool={t => {
            setActiveTool(t)
            setPreviewEl(null)
            drawStartRef.current = null
            penPointsRef.current = []
            elemDragStartRef.current = null
            setDragOffset(null)
          }}
          strokeColor={strokeColor}
          onStrokeColor={setStrokeColor}
          stickyColor={stickyColor}
          onStickyColor={setStickyColor}
          strokeWidth={strokeWidth}
          onStrokeWidth={setStrokeWidth}
          selectedElementId={selectedId}
          onDeleteSelected={handleDeleteSelected}
        />

        {/* Inline text edit */}
        <Modal visible={!!editTextEl} transparent animationType="fade">
          <View style={st.editOverlay}>
            <View style={[st.editBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[st.editInput, { color: colors.text, borderColor: colors.border }]}
                value={editTextValue}
                onChangeText={setEditTextValue}
                multiline
                autoFocus
                placeholder="Enter text…"
                placeholderTextColor={colors.textMuted}
              />
              <View style={st.editBtns}>
                <TouchableOpacity
                  style={[st.editBtn, { borderColor: colors.border }]}
                  onPress={() => setEditTextEl(null)}
                >
                  <Text style={{ color: colors.textMuted }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.editBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveText}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </GestureHandlerRootView>
    </Modal>
  )
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, zIndex: 10,
  },
  boardName: { flex: 1, fontSize: 16, fontWeight: '700' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  editOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  editBox: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 16 },
  editInput: {
    borderWidth: 1, borderRadius: 8, padding: 12,
    fontSize: 15, minHeight: 88, textAlignVertical: 'top', marginBottom: 12,
  },
  editBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  editBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
})
