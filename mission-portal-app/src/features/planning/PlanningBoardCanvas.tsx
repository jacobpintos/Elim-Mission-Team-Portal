'use no memo'
import { useState, useRef } from 'react'
import {
  Modal,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  Linking,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Svg, { Polyline, Line } from 'react-native-svg'
import { usePlanningStore } from '@/stores/planningStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { sameId } from '@/lib/ids'
import type { PlanningItem, PlanningItemType, DrawPoint } from '@/types/operations'

const CANVAS_W = 4000
const CANVAS_H = 4000

type ToolType =
  | 'pan'
  | 'select'
  | 'note'
  | 'goal'
  | 'checklist'
  | 'link'
  | 'draw'
  | 'connector'
  | 'eraser'

const TOOL_BUTTONS: { type: ToolType; label: string; icon: string }[] = [
  { type: 'select', label: 'Select', icon: '✦' },
  { type: 'pan', label: 'Pan', icon: '✋' },
  { type: 'note', label: 'Note', icon: '📝' },
  { type: 'goal', label: 'Goal', icon: '🎯' },
  { type: 'checklist', label: 'List', icon: '☑' },
  { type: 'link', label: 'Link', icon: '🔗' },
  { type: 'draw', label: 'Draw', icon: '✏' },
  { type: 'connector', label: 'Connect', icon: '⟷' },
  { type: 'eraser', label: 'Erase', icon: '⌫' },
]

const NOTE_COLORS = ['#FFF176', '#B3E5FC', '#C8E6C9', '#F8BBD0', '#E1BEE7']

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  note: { width: 200, height: 150 },
  goal: { width: 220, height: 90 },
  checklist: { width: 220, height: 60 },
  link: { width: 240, height: 70 },
}

interface PlanningBoardCanvasProps {
  boardId: string | number | null
  readOnly?: boolean
  visible: boolean
  onClose: () => void
}

interface CreateModalState {
  visible: boolean
  type: PlanningItemType
  vx: number
  vy: number
  editItemId?: string
}

const defaultCreateModal: CreateModalState = {
  visible: false,
  type: 'note',
  vx: 0,
  vy: 0,
}

// ---------------------------------------------------------------------------
// ItemCard — separate component to avoid nested hook issues
// ---------------------------------------------------------------------------
interface ItemCardProps {
  item: PlanningItem
  boardId: string | number | null
  sc: ReturnType<typeof useSharedValue<number>>
  tool: ToolType
  readOnly: boolean
  selectedId: string | null
  connectorFrom: string | null
  colors: ReturnType<typeof useThemeColors>
  onSelectId: (id: string | null) => void
  onConnectorTap: (id: string) => void
  onEditItem: (item: PlanningItem) => void
  onDeleteItem: (boardId: string | number, itemId: string) => void
  onUpdateItem: (boardId: string | number, itemId: string, patch: Partial<PlanningItem>) => void
}

function ItemCard({
  item,
  boardId,
  sc,
  tool,
  readOnly,
  selectedId,
  connectorFrom,
  colors,
  onSelectId,
  onConnectorTap,
  onEditItem,
  onDeleteItem,
  onUpdateItem,
}: ItemCardProps) {
  'use no memo'

  const isSelected = selectedId === item.id
  const dragX = useSharedValue(item.x)
  const dragY = useSharedValue(item.y)
  const startX = useSharedValue(item.x)
  const startY = useSharedValue(item.y)

  const itemStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: dragX.value,
    top: dragY.value,
    width: item.width,
    height: item.height,
  }))

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = dragX.value

      startY.value = dragY.value
    })
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      dragX.value = startX.value + e.translationX / sc.value
      // eslint-disable-next-line react-hooks/immutability
      dragY.value = startY.value + e.translationY / sc.value
    })
    .onEnd(() => {
      if (!boardId) return
      runOnJS(onUpdateItem)(boardId, item.id, { x: dragX.value, y: dragY.value })
    })

  const eraserTap = Gesture.Tap().onEnd(() => {
    if (!boardId) return
    runOnJS(onDeleteItem)(boardId, item.id)
  })

  const connectorTap = Gesture.Tap().onEnd(() => {
    runOnJS(onConnectorTap)(item.id)
  })

  const selectTap = Gesture.Tap().onEnd(() => {
    runOnJS(onSelectId)(item.id === selectedId ? null : item.id)
  })

  let itemGesture
  if (readOnly) {
    itemGesture = Gesture.Tap()
  } else if (tool === 'eraser') {
    itemGesture = eraserTap
  } else if (tool === 'connector') {
    itemGesture = connectorTap
  } else if (tool === 'select') {
    itemGesture = Gesture.Simultaneous(selectTap, dragGesture)
  } else {
    itemGesture = Gesture.Tap()
  }

  const isConnectorSource = connectorFrom === item.id
  const cardBg = item.type === 'note' ? (item.color ?? '#FFF176') : colors.surface

  return (
    <GestureDetector gesture={itemGesture}>
      <Animated.View
        style={[
          itemStyle,
          {
            backgroundColor: cardBg,
            borderRadius: 6,
            borderWidth: isSelected || isConnectorSource ? 2 : 1,
            borderColor: isConnectorSource
              ? colors.primary
              : isSelected
                ? colors.accent
                : colors.border,
            padding: 8,
            overflow: 'hidden',
          },
        ]}
      >
        {item.type === 'note' && (
          <Text color="#333" fontSize={13} numberOfLines={6}>
            {item.content}
          </Text>
        )}
        {item.type === 'goal' && (
          <XStack gap={6} alignItems="flex-start">
            <Pressable
              onPress={() => {
                if (!readOnly && boardId) {
                  onUpdateItem(boardId, item.id, { completed: !item.completed })
                }
              }}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: colors.primary,
                backgroundColor: item.completed ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              {item.completed ? (
                <Text color="#fff" fontSize={10}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
            <YStack flex={1}>
              <Text
                color={colors.text}
                fontSize={13}
                fontWeight="600"
                textDecorationLine={item.completed ? 'line-through' : 'none'}
                numberOfLines={2}
              >
                {item.content}
              </Text>
              {item.dueDate ? (
                <Text color={colors.textMuted} fontSize={11}>
                  Due: {item.dueDate}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        )}
        {item.type === 'checklist' && (
          <XStack gap={6} alignItems="center">
            <Pressable
              onPress={() => {
                if (!readOnly && boardId) {
                  onUpdateItem(boardId, item.id, { completed: !item.completed })
                }
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                borderWidth: 2,
                borderColor: colors.primary,
                backgroundColor: item.completed ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.completed ? (
                <Text color="#fff" fontSize={10}>
                  ✓
                </Text>
              ) : null}
            </Pressable>
            <Text
              color={colors.text}
              fontSize={13}
              textDecorationLine={item.completed ? 'line-through' : 'none'}
              numberOfLines={2}
              style={{ flex: 1 }}
            >
              {item.content}
            </Text>
          </XStack>
        )}
        {item.type === 'link' && (
          <YStack gap={4}>
            <Text color={colors.text} fontSize={12} numberOfLines={2}>
              {item.content || item.url}
            </Text>
            <Pressable
              onPress={() => {
                if (item.url) Linking.openURL(item.url)
              }}
            >
              <Text color={colors.primary} fontSize={12}>
                Open →
              </Text>
            </Pressable>
          </YStack>
        )}

        {/* Selection action bar */}
        {isSelected && !readOnly && tool === 'select' && (
          <View
            style={{
              position: 'absolute',
              top: -32,
              left: 0,
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Pressable
              onPress={() => onEditItem(item)}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
              }}
            >
              <Text color={colors.onPrimary} fontSize={11}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (boardId) onDeleteItem(boardId, item.id)
                onSelectId(null)
              }}
              style={{
                backgroundColor: '#e53935',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
              }}
            >
              <Text color="#fff" fontSize={11}>
                Delete
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

// ---------------------------------------------------------------------------
// Main PlanningBoardCanvas component
// ---------------------------------------------------------------------------
export function PlanningBoardCanvas({
  boardId,
  readOnly = false,
  visible,
  onClose,
}: PlanningBoardCanvasProps) {
  'use no memo'

  const colors = useThemeColors()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const { boards, addItem, updateItem, deleteItem } = usePlanningStore()
  const board = boards.find((b) => sameId(b.id, boardId ?? ''))

  // Viewport transform (Reanimated shared values)
  const tx = useSharedValue(-(CANVAS_W / 2 - screenW / 2))
  const ty = useSharedValue(-(CANVAS_H / 2 - screenH / 2))
  const sc = useSharedValue(1)
  const savedTx = useSharedValue(-(CANVAS_W / 2 - screenW / 2))
  const savedTy = useSharedValue(-(CANVAS_H / 2 - screenH / 2))
  const savedSc = useSharedValue(1)

  // Tool state
  const [tool, setTool] = useState<ToolType>('pan')
  const toolRef = useRef<ToolType>('pan')

  function updateTool(t: ToolType) {
    toolRef.current = t
    setTool(t)
  }

  // Draw state
  const [drawPoints, setDrawPoints] = useState<DrawPoint[]>([])
  const isDrawing = useRef(false)

  // Connector state
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null)

  // Selected item
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Create modal state
  const [createModal, setCreateModal] = useState<CreateModalState>(defaultCreateModal)
  const [createContent, setCreateContent] = useState('')
  const [createUrl, setCreateUrl] = useState('')
  const [createColor, setCreateColor] = useState(NOTE_COLORS[0])

  // Animated canvas transform
  const canvasTransformStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }))

  // JS callbacks for gestures
  function addPoint(x: number, y: number) {
    setDrawPoints((prev) => [...prev, { x, y }])
  }

  function finalizeDraw(pts: DrawPoint[]) {
    if (!boardId || pts.length < 2) {
      setDrawPoints([])
      isDrawing.current = false
      return
    }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    addItem(boardId, {
      type: 'draw',
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      content: '',
      points: pts,
      color: '#333',
    })
    setDrawPoints([])
    isDrawing.current = false
  }

  function openCreateModal(type: PlanningItemType, vx: number, vy: number) {
    setCreateContent('')
    setCreateUrl('')
    setCreateColor(NOTE_COLORS[0])
    setCreateModal({ visible: true, type, vx, vy })
  }

  function handleBgTap(absX: number, absY: number) {
    const currentTool = toolRef.current
    const vx = (absX - tx.value) / sc.value
    const vy = (absY - ty.value) / sc.value
    if (['note', 'goal', 'checklist', 'link'].includes(currentTool)) {
      openCreateModal(currentTool as PlanningItemType, vx, vy)
    } else {
      setSelectedId(null)
    }
  }

  function handleConnectorTap(itemId: string) {
    if (!boardId) return
    if (connectorFrom === null) {
      setConnectorFrom(itemId)
    } else if (connectorFrom !== itemId) {
      addItem(boardId, {
        type: 'connector',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        content: '',
        fromId: connectorFrom,
        toId: itemId,
      })
      setConnectorFrom(null)
    } else {
      setConnectorFrom(null)
    }
  }

  function handleEditItem(item: PlanningItem) {
    setCreateContent(item.content)
    setCreateUrl(item.url ?? '')
    setCreateColor(item.color ?? NOTE_COLORS[0])
    setCreateModal({
      visible: true,
      type: item.type,
      vx: item.x,
      vy: item.y,
      editItemId: item.id,
    })
  }

  function handleCreateSubmit() {
    if (!boardId) return
    const { type, vx, vy, editItemId } = createModal
    const sizes = DEFAULT_SIZES[type] ?? { width: 200, height: 100 }

    if (editItemId) {
      updateItem(boardId, editItemId, {
        content: createContent,
        ...(type === 'link' ? { url: createUrl } : {}),
        ...(type === 'note' ? { color: createColor } : {}),
      })
    } else {
      addItem(boardId, {
        type,
        x: vx - sizes.width / 2,
        y: vy - sizes.height / 2,
        width: sizes.width,
        height: sizes.height,
        content: createContent,
        ...(type === 'link' ? { url: createUrl } : {}),
        ...(type === 'note' ? { color: createColor } : {}),
      })
    }
    setCreateModal(defaultCreateModal)
    setSelectedId(null)
  }

  // Pinch gesture
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      sc.value = Math.min(4, Math.max(0.2, savedSc.value * e.scale))
    })
    .onEnd(() => {
      savedSc.value = sc.value
    })

  // Viewport 2-finger pan
  const viewportPan = Gesture.Pan()
    .minPointers(readOnly ? 1 : 2)
    .maxPointers(readOnly ? 2 : 2)
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      tx.value = savedTx.value + e.translationX
      // eslint-disable-next-line react-hooks/immutability
      ty.value = savedTy.value + e.translationY
    })
    .onEnd(() => {
      savedTx.value = tx.value

      savedTy.value = ty.value
    })

  const viewportGesture = Gesture.Simultaneous(pinch, viewportPan)

  // Background tap (creation tools)
  // eslint-disable-next-line react-hooks/refs
  const bgTap = Gesture.Tap().onEnd((e) => {
    runOnJS(handleBgTap)(e.absoluteX, e.absoluteY)
  })

  // Draw gesture (records points on canvas)

  const drawPan = Gesture.Pan()
    // eslint-disable-next-line react-hooks/refs
    .onStart((e) => {
      if (toolRef.current !== 'draw') return
      isDrawing.current = true
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      runOnJS(setDrawPoints)([{ x: vx, y: vy }])
    })
    // eslint-disable-next-line react-hooks/refs
    .onUpdate((e) => {
      if (!isDrawing.current) return
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      runOnJS(addPoint)(vx, vy)
    })
    // eslint-disable-next-line react-hooks/refs
    .onEnd(() => {
      if (!isDrawing.current) return
      runOnJS(finalizeDraw)(drawPoints)
    })

  // 1-finger pan (pan tool)

  const panToolGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    // eslint-disable-next-line react-hooks/refs
    .onUpdate((e) => {
      if (toolRef.current !== 'pan') return
      // eslint-disable-next-line react-hooks/immutability
      tx.value = savedTx.value + e.translationX
      // eslint-disable-next-line react-hooks/immutability
      ty.value = savedTy.value + e.translationY
    })
    // eslint-disable-next-line react-hooks/refs
    .onEnd(() => {
      if (toolRef.current !== 'pan') return

      savedTx.value = tx.value

      savedTy.value = ty.value
    })

  const bgGesture = readOnly
    ? (Gesture.Exclusive(bgTap) as ReturnType<typeof Gesture.Exclusive>)
    : Gesture.Race(drawPan, panToolGesture, bgTap)

  const items = board?.items ?? []
  const nonSvgItems = items.filter((i) => i.type !== 'draw' && i.type !== 'connector')

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Toolbar */}
          {!readOnly && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                backgroundColor: colors.surface,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingHorizontal: 4,
                paddingVertical: 4,
                gap: 2,
              }}
            >
              {TOOL_BUTTONS.map((btn) => (
                <Pressable
                  key={btn.type}
                  onPress={() => {
                    updateTool(btn.type)
                    setConnectorFrom(null)
                    setSelectedId(null)
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: tool === btn.type ? colors.primary : 'transparent',
                    alignItems: 'center',
                    minWidth: 52,
                  }}
                >
                  <Text fontSize={16}>{btn.icon}</Text>
                  <Text
                    fontSize={10}
                    color={tool === btn.type ? colors.onPrimary : colors.textMuted}
                  >
                    {btn.label}
                  </Text>
                </Pressable>
              ))}
              {connectorFrom !== null && (
                <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                  <Text color={colors.primary} fontSize={11}>
                    Tap target item
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Canvas area */}
          <View style={{ flex: 1, overflow: 'hidden' }} collapsable={false}>
            <GestureDetector gesture={viewportGesture}>
              <Animated.View style={[StyleSheet.absoluteFill, canvasTransformStyle]}>
                <GestureDetector gesture={bgGesture}>
                  <View style={{ width: CANVAS_W, height: CANVAS_H }}>
                    {/* SVG overlay */}
                    <Svg
                      width={CANVAS_W}
                      height={CANVAS_H}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    >
                      {items
                        .filter((i) => i.type === 'draw' && i.points)
                        .map((item) => (
                          <Polyline
                            key={item.id}
                            points={item.points!.map((p) => `${p.x},${p.y}`).join(' ')}
                            stroke={item.color ?? '#333'}
                            strokeWidth={2}
                            fill="none"
                          />
                        ))}
                      {drawPoints.length > 1 && (
                        <Polyline
                          points={drawPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                          stroke="#333"
                          strokeWidth={2}
                          fill="none"
                        />
                      )}
                      {items
                        .filter((i) => i.type === 'connector')
                        .map((connector) => {
                          const from = items.find((i) => i.id === connector.fromId)
                          const to = items.find((i) => i.id === connector.toId)
                          if (!from || !to) return null
                          return (
                            <Line
                              key={connector.id}
                              x1={from.x + from.width / 2}
                              y1={from.y + from.height / 2}
                              x2={to.x + to.width / 2}
                              y2={to.y + to.height / 2}
                              stroke={colors.textMuted}
                              strokeWidth={2}
                            />
                          )
                        })}
                    </Svg>

                    {/* Item cards */}
                    {nonSvgItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        boardId={boardId}
                        sc={sc}
                        tool={tool}
                        readOnly={readOnly}
                        selectedId={selectedId}
                        connectorFrom={connectorFrom}
                        colors={colors}
                        onSelectId={setSelectedId}
                        onConnectorTap={handleConnectorTap}
                        onEditItem={handleEditItem}
                        onDeleteItem={deleteItem}
                        onUpdateItem={updateItem}
                      />
                    ))}
                  </View>
                </GestureDetector>
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={{
              position: 'absolute',
              top: readOnly ? 12 : 60,
              right: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              zIndex: 100,
            }}
          >
            <Text color={colors.text} fontSize={13}>
              ✕ Close
            </Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>

      {/* Create / Edit modal */}
      <Modal
        visible={createModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateModal(defaultCreateModal)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateModal(defaultCreateModal)}>
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={12}>
              {createModal.editItemId ? 'Edit Item' : `Add ${createModal.type}`}
            </Text>

            <TextInput
              placeholder="Content"
              placeholderTextColor={colors.textMuted}
              value={createContent}
              onChangeText={setCreateContent}
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.background,
                },
              ]}
              multiline={createModal.type === 'note'}
              numberOfLines={createModal.type === 'note' ? 4 : 1}
            />

            {createModal.type === 'link' && (
              <TextInput
                placeholder="URL (https://...)"
                placeholderTextColor={colors.textMuted}
                value={createUrl}
                onChangeText={setCreateUrl}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                    marginTop: 8,
                  },
                ]}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}

            {createModal.type === 'note' && (
              <XStack gap={8} marginTop={10} alignItems="center">
                <Text color={colors.textMuted} fontSize={12}>
                  Color:
                </Text>
                {NOTE_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCreateColor(c)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: c,
                      borderWidth: createColor === c ? 3 : 1,
                      borderColor: createColor === c ? colors.primary : colors.border,
                    }}
                  />
                ))}
              </XStack>
            )}

            <XStack gap={10} marginTop={14} justifyContent="flex-end">
              <Pressable
                onPress={() => setCreateModal(defaultCreateModal)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text color={colors.textMuted} fontSize={13}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreateSubmit}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 6,
                  backgroundColor: colors.primary,
                }}
              >
                <Text color={colors.onPrimary} fontSize={13} fontWeight="600">
                  Add
                </Text>
              </Pressable>
            </XStack>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
})
