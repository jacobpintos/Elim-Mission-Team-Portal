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
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  | 'shape'
  | 'textbox'

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
  { type: 'textbox', label: 'Text', icon: 'T' },
  { type: 'shape', label: 'Shape', icon: '▭' },
]

const NOTE_COLORS = ['#FFF176', '#B3E5FC', '#C8E6C9', '#F8BBD0', '#E1BEE7']

// Text box formatting maps.
const TEXT_FONT_SIZES: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 30,
}
// Resolve a typeface key to a concrete platform font family (system fonts, so
// no extra font files need bundling). iOS ships Georgia / Courier New / Bradley
// Hand; web falls back to CSS generic families.
function textFontFamily(f?: string): string | undefined {
  switch (f) {
    case 'serif':
      return Platform.OS === 'ios' ? 'Georgia' : Platform.OS === 'web' ? 'serif' : 'serif'
    case 'mono':
      return Platform.OS === 'ios'
        ? 'Courier New'
        : Platform.OS === 'web'
          ? 'monospace'
          : 'monospace'
    case 'hand':
      return Platform.OS === 'ios' ? 'Bradley Hand' : Platform.OS === 'web' ? 'cursive' : undefined
    default:
      return undefined
  }
}
const FONT_SIZE_OPTIONS: { key: 'sm' | 'md' | 'lg' | 'xl'; label: string }[] = [
  { key: 'sm', label: 'S' },
  { key: 'md', label: 'M' },
  { key: 'lg', label: 'L' },
  { key: 'xl', label: 'XL' },
]
const FONT_FAMILY_OPTIONS: { key: 'default' | 'serif' | 'mono' | 'hand'; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Mono' },
  { key: 'hand', label: 'Hand' },
]

const PALETTE = [
  '#1a1a1a',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
  '#92400e',
]

/** Tools that drop an object on the board when you tap it. */
const PLACEABLE_TOOLS: PlanningItemType[] = [
  'note',
  'goal',
  'checklist',
  'link',
  'textbox',
  'shape',
]

/** Types whose text can be edited in place by tapping inside them. */
const TYPEABLE_TYPES: PlanningItemType[] = ['note', 'goal', 'checklist', 'textbox']

/** Width of the border band that drags a typeable object rather than editing it. */
const EDGE_BAND = 14

/** Enough of an item to open the edit modal against one just created. */
const EMPTY_ITEM: PlanningItem = {
  id: '',
  type: 'note',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  content: '',
}

const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  note: { width: 200, height: 150 },
  goal: { width: 220, height: 90 },
  checklist: { width: 220, height: 60 },
  link: { width: 240, height: 70 },
  textbox: { width: 200, height: 60 },
  shape: { width: 120, height: 80 },
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
  // When a text box is drawn (rather than tapped), vx/vy are the top-left of
  // the drawn box and w/h are its size — used verbatim instead of centering a
  // default-sized item.
  w?: number
  h?: number
}

const defaultCreateModal: CreateModalState = { visible: false, type: 'note', vx: 0, vy: 0 }

// ---------------------------------------------------------------------------
// ItemCard
// ---------------------------------------------------------------------------
interface ItemCardProps {
  item: PlanningItem
  boardId: string | number | null
  sc: ReturnType<typeof useSharedValue<number>>
  tool: ToolType
  readOnly: boolean
  selectedId: string | null
  editingId: string | null
  connectorFrom: string | null
  colors: ReturnType<typeof useThemeColors>
  onSelectId: (id: string | null) => void
  onStartEdit: (id: string | null) => void
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
  editingId,
  connectorFrom,
  colors,
  onSelectId,
  onStartEdit,
  onConnectorTap,
  onEditItem,
  onDeleteItem,
  onUpdateItem,
}: ItemCardProps) {
  'use no memo'

  const isSelected = selectedId === item.id
  const isEditing = editingId === item.id
  const isTypeable = TYPEABLE_TYPES.includes(item.type)
  // Draft text lives here while typing so each keystroke does not round-trip
  // through Firestore; it is committed on blur.
  const [draft, setDraft] = useState(item.content)

  const dragX = useSharedValue(item.x)
  const dragY = useSharedValue(item.y)
  const startX = useSharedValue(item.x)
  const startY = useSharedValue(item.y)

  const sizeW = useSharedValue(item.width)
  const sizeH = useSharedValue(item.height)
  const startW = useSharedValue(item.width)
  const startH = useSharedValue(item.height)
  const isResizing = useSharedValue(false)

  // Sync dimensions if updated externally (Firestore) and not mid-resize
  if (!isResizing.value && (sizeW.value !== item.width || sizeH.value !== item.height)) {
    sizeW.value = item.width
    sizeH.value = item.height
  }

  const itemStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: dragX.value,
    top: dragY.value,
    width: sizeW.value,
    height: sizeH.value,
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

  const resizeGesture = Gesture.Pan()
    .onStart(() => {
      startW.value = sizeW.value
      startH.value = sizeH.value
      isResizing.value = true
    })
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      sizeW.value = Math.max(80, startW.value + e.translationX / sc.value)
      // eslint-disable-next-line react-hooks/immutability
      sizeH.value = Math.max(36, startH.value + e.translationY / sc.value)
    })
    .onEnd(() => {
      isResizing.value = false
      if (!boardId) return
      runOnJS(onUpdateItem)(boardId, item.id, { width: sizeW.value, height: sizeH.value })
    })

  // Pinch the object to size it, instead of hunting for the corner handle.
  // The board's pinch-to-zoom lives on an outer detector, so a pinch that
  // starts on an object is claimed here and the board stays put.
  const pinchResize = Gesture.Pinch()
    .onStart(() => {
      startW.value = sizeW.value
      startH.value = sizeH.value
      // eslint-disable-next-line react-hooks/immutability
      isResizing.value = true
    })
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      sizeW.value = Math.max(40, startW.value * e.scale)
      // eslint-disable-next-line react-hooks/immutability
      sizeH.value = Math.max(30, startH.value * e.scale)
    })
    .onEnd(() => {
      // eslint-disable-next-line react-hooks/immutability
      isResizing.value = false
      if (!boardId) return
      runOnJS(onUpdateItem)(boardId, item.id, { width: sizeW.value, height: sizeH.value })
    })

  const eraserTap = Gesture.Tap().onEnd(() => {
    if (!boardId) return
    runOnJS(onDeleteItem)(boardId, item.id)
  })

  const connectorTap = Gesture.Tap().onEnd(() => {
    runOnJS(onConnectorTap)(item.id)
  })

  // Tap to select, tap the selected object again to type in it. Doing it this
  // way rather than with an inner Pressable keeps the pan gesture unobstructed
  // — a Pressable covering the body would swallow the drag.
  const selectTap = Gesture.Tap().onEnd(() => {
    if (isSelected && isTypeable && !readOnly) {
      runOnJS(onStartEdit)(item.id)
      return
    }
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
    // While typing, the body belongs to the text input — dragging then only
    // happens from the edge band, so a touch meant for the caret does not
    // shove the object across the board.
    itemGesture = isEditing
      ? Gesture.Simultaneous(Gesture.Tap(), pinchResize)
      : Gesture.Simultaneous(selectTap, dragGesture, pinchResize)
  } else {
    itemGesture = Gesture.Tap()
  }

  const isConnectorSource = connectorFrom === item.id
  const cardBg =
    item.type === 'note'
      ? (item.color ?? '#FFF176')
      : item.type === 'textbox' || item.type === 'shape'
        ? 'transparent'
        : colors.surface

  // Every placed object resizes now. Drawings and connectors are derived from
  // their points or endpoints, so there is nothing to drag a corner on.
  const canResize =
    !readOnly && tool === 'select' && item.type !== 'draw' && item.type !== 'connector'

  return (
    <GestureDetector gesture={itemGesture}>
      <Animated.View
        style={[
          itemStyle,
          {
            backgroundColor: cardBg,
            borderRadius: 6,
            borderWidth:
              item.type === 'shape' || item.type === 'textbox'
                ? isSelected
                  ? 2
                  : 0
                : isSelected || isConnectorSource
                  ? 2
                  : 1,
            borderColor: isConnectorSource
              ? colors.primary
              : isSelected
                ? colors.accent
                : colors.border,
            padding: 8,
            overflow: 'visible',
          },
        ]}
      >
        {isEditing ? (
          <>
            {/* Edge strip: while the body belongs to the text input, this is
                what moves the object. */}
            <GestureDetector gesture={dragGesture}>
              <View
                style={{
                  position: 'absolute',
                  top: -EDGE_BAND,
                  left: -EDGE_BAND,
                  right: -EDGE_BAND,
                  height: EDGE_BAND * 2,
                  backgroundColor: colors.accent,
                  opacity: 0.25,
                  borderRadius: 4,
                  zIndex: 9,
                }}
              />
            </GestureDetector>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              onBlur={() => {
                if (boardId && draft !== item.content) {
                  onUpdateItem(boardId, item.id, { content: draft })
                }
                onStartEdit(null)
              }}
              style={{
                flex: 1,
                color: item.type === 'note' ? '#333' : colors.text,
                fontSize: item.type === 'textbox' ? TEXT_FONT_SIZES[item.fontSize ?? 'md'] : 13,
                fontFamily: item.type === 'textbox' ? textFontFamily(item.fontFamily) : undefined,
                fontWeight: item.type === 'textbox' && item.bold ? '700' : '400',
                textAlign: item.type === 'textbox' ? (item.align ?? 'left') : 'left',
                padding: 0,
                textAlignVertical: 'top',
              }}
              placeholder="Type…"
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        {!isEditing && item.type === 'note' && (
          <Text color="#333" fontSize={13} numberOfLines={6}>
            {item.content}
          </Text>
        )}
        {!isEditing && item.type === 'goal' && (
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
        {!isEditing && item.type === 'checklist' && (
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
        {!isEditing && item.type === 'textbox' && (
          <Text
            numberOfLines={12}
            style={{
              color: item.color ?? colors.text,
              fontSize: TEXT_FONT_SIZES[item.fontSize ?? 'md'],
              fontFamily: textFontFamily(item.fontFamily),
              fontWeight: item.bold ? '700' : '400',
              textAlign: item.align ?? 'left',
            }}
          >
            {item.content}
          </Text>
        )}
        {item.type === 'shape' && (
          <View
            style={{
              flex: 1,
              borderWidth: 2,
              borderColor: item.color ?? colors.primary,
              borderRadius: item.shapeType === 'circle' ? 9999 : 4,
              backgroundColor: 'transparent',
            }}
          />
        )}

        {/* Selection action bar */}
        {isSelected && !readOnly && tool === 'select' && (
          <View style={{ position: 'absolute', top: -32, left: 0, flexDirection: 'row', gap: 6 }}>
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

        {/* Resize handle */}
        {canResize && (
          <GestureDetector gesture={resizeGesture}>
            <View
              style={{
                position: 'absolute',
                right: -7,
                bottom: -7,
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: '#fff',
                zIndex: 10,
              }}
            />
          </GestureDetector>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

// ---------------------------------------------------------------------------
// Main PlanningBoardCanvas
// ---------------------------------------------------------------------------
export function PlanningBoardCanvas({
  boardId,
  readOnly = false,
  visible,
  onClose,
}: PlanningBoardCanvasProps) {
  'use no memo'

  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const { boards, addItem, updateItem, deleteItem } = usePlanningStore()
  const board = boards.find((b) => sameId(b.id, boardId ?? ''))

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

  // Color
  const [activeColor, setActiveColor] = useState(PALETTE[0])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const activeColorRef = useRef(PALETTE[0])
  function updateActiveColor(c: string) {
    activeColorRef.current = c
    setActiveColor(c)
  }

  // Shape mode
  const [shapeMode, setShapeMode] = useState<'rect' | 'circle'>('rect')
  const shapeModeRef = useRef<'rect' | 'circle'>('rect')
  function updateShapeMode(m: 'rect' | 'circle') {
    shapeModeRef.current = m
    setShapeMode(m)
  }

  // Draw
  const [drawPoints, setDrawPoints] = useState<DrawPoint[]>([])
  // The stroke is mirrored on a ref because the gesture callbacks are
  // worklets: they capture drawPoints by value when created, so passing that
  // state to finalizeDraw handed it the empty array it started with and every
  // stroke was discarded for having fewer than two points. The flag is a
  // shared value for the same reason — a React ref written on the UI thread
  // does not read back.
  const drawPointsRef = useRef<DrawPoint[]>([])
  const isDrawing = useSharedValue(false)

  // Shape drag preview
  const shapeDragStartX = useSharedValue(0)
  const shapeDragStartY = useSharedValue(0)
  const shapeDragCurX = useSharedValue(0)
  const shapeDragCurY = useSharedValue(0)
  const isDraggingShape = useSharedValue(false)
  const shapePreviewColor = useSharedValue(PALETTE[0])
  const shapePreviewRadius = useSharedValue(4)

  // Connector / selection
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Item whose text is being typed into in place.
  const [editingId, setEditingId] = useState<string | null>(null)

  // Create / edit modal
  const [createModal, setCreateModal] = useState<CreateModalState>(defaultCreateModal)
  const [createContent, setCreateContent] = useState('')
  const [createUrl, setCreateUrl] = useState('')
  const [createColor, setCreateColor] = useState(NOTE_COLORS[0])
  const [createShapeType, setCreateShapeType] = useState<'rect' | 'circle'>('rect')
  // Text box formatting
  const [createFontSize, setCreateFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md')
  const [createFontFamily, setCreateFontFamily] = useState<'default' | 'serif' | 'mono' | 'hand'>(
    'default'
  )
  const [createBold, setCreateBold] = useState(false)
  const [createAlign, setCreateAlign] = useState<'left' | 'center'>('left')

  // Animated canvas transform
  const canvasTransformStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }))

  // Shape drag preview style
  const shapePreviewStyle = useAnimatedStyle(() => {
    if (!isDraggingShape.value) return { display: 'none' as const }
    const x = Math.min(shapeDragStartX.value, shapeDragCurX.value)
    const y = Math.min(shapeDragStartY.value, shapeDragCurY.value)
    const w = Math.abs(shapeDragCurX.value - shapeDragStartX.value)
    const h = Math.abs(shapeDragCurY.value - shapeDragStartY.value)
    return {
      display: 'flex' as const,
      position: 'absolute' as const,
      left: x,
      top: y,
      width: Math.max(w, 4),
      height: Math.max(h, 4),
      borderWidth: 3,
      borderStyle: 'dashed' as const,
      borderColor: shapePreviewColor.value,
      borderRadius: shapePreviewRadius.value,
      // Translucent fill so the shape being drawn is clearly visible while
      // gesturing (a thin transparent border read as "no indicator").
      backgroundColor: shapePreviewColor.value + '33',
    }
  })

  function startStroke(x: number, y: number) {
    drawPointsRef.current = [{ x, y }]
    setDrawPoints(drawPointsRef.current)
  }

  function addPoint(x: number, y: number) {
    drawPointsRef.current = [...drawPointsRef.current, { x, y }]
    setDrawPoints(drawPointsRef.current)
  }

  function finalizeDraw() {
    const pts = drawPointsRef.current
    if (!boardId || pts.length < 2) {
      drawPointsRef.current = []
      setDrawPoints([])
      return
    }
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y)
    const minX = Math.min(...xs),
      minY = Math.min(...ys)
    addItem(boardId, {
      type: 'draw',
      x: minX,
      y: minY,
      width: Math.max(Math.max(...xs) - minX, 1),
      height: Math.max(Math.max(...ys) - minY, 1),
      content: '',
      points: pts,
      color: activeColorRef.current,
    })
    drawPointsRef.current = []
    setDrawPoints([])
  }

  async function finalizeShape(sx: number, sy: number, ex: number, ey: number) {
    if (!boardId) return
    const x = Math.min(sx, ex)
    const y = Math.min(sy, ey)
    const width = Math.max(Math.abs(ex - sx), 30)
    const height = Math.max(Math.abs(ey - sy), 30)
    const id = await addItem(boardId, {
      type: 'shape',
      x,
      y,
      width,
      height,
      content: '',
      shapeType: shapeModeRef.current,
      color: activeColorRef.current,
    })
    // Hand a drawn shape over the same way a tapped one is handed over, so it
    // can be dragged somewhere else straight away instead of leaving the shape
    // tool armed and the new shape unreachable.
    if (id) {
      updateTool('select')
      setSelectedId(id)
    }
  }

  function openCreateModal(type: PlanningItemType, vx: number, vy: number) {
    setCreateContent('')
    setCreateUrl('')
    setCreateColor(NOTE_COLORS[0])
    setCreateShapeType('rect')
    setCreateFontSize('md')
    setCreateFontFamily('default')
    setCreateBold(false)
    setCreateAlign('left')
    setCreateModal({ visible: true, type, vx, vy })
  }

  // A text box is drawn (drag to size/place) rather than tapped. On release we
  // open the editor pre-sized to the drawn box so the user can type + format.
  function finalizeTextbox(sx: number, sy: number, ex: number, ey: number) {
    if (!boardId) return
    const x = Math.min(sx, ex)
    const y = Math.min(sy, ey)
    const width = Math.max(Math.abs(ex - sx), 80)
    const height = Math.max(Math.abs(ey - sy), 40)
    setCreateContent('')
    setCreateUrl('')
    setCreateColor(colors.text)
    setCreateFontSize('md')
    setCreateFontFamily('default')
    setCreateBold(false)
    setCreateAlign('left')
    setCreateModal({ visible: true, type: 'textbox', vx: x, vy: y, w: width, h: height })
  }

  /**
   * Tap the board with a tool active and that object appears there, already
   * sized and ready to edit.
   *
   * Every placeable type used to demand something before it existed: notes,
   * goals, checklists and links opened a modal to type into first, and shapes
   * and text boxes had to be dragged out to a size. Tapping now drops a
   * default-sized object at the tap point and puts typeable ones straight into
   * edit mode. Dragging a shape or text box still sizes it, for when a
   * particular size is wanted up front.
   */
  async function handleBgTap(absX: number, absY: number) {
    const currentTool = toolRef.current
    const vx = (absX - tx.value) / sc.value
    const vy = (absY - ty.value) / sc.value

    if (!PLACEABLE_TOOLS.includes(currentTool as PlanningItemType)) {
      setSelectedId(null)
      setEditingId(null)
      return
    }
    if (!boardId) return

    const type = currentTool as PlanningItemType
    const size = DEFAULT_SIZES[type] ?? { width: 200, height: 100 }
    const id = await addItem(boardId, {
      type,
      // Centred on the tap, so the object lands where the finger went rather
      // than hanging below and to the right of it.
      x: vx - size.width / 2,
      y: vy - size.height / 2,
      width: size.width,
      height: size.height,
      content: '',
      ...(type === 'shape'
        ? { shapeType: shapeModeRef.current, color: activeColorRef.current }
        : {}),
      // A note's colour is its paper, not its ink. Using the draw palette here
      // made every tapped note a near-black card with near-black text on it.
      ...(type === 'note' ? { color: NOTE_COLORS[0] } : {}),
      ...(type === 'textbox'
        ? {
            color: activeColorRef.current,
            fontSize: createFontSize,
            fontFamily: createFontFamily,
            bold: createBold,
            align: createAlign,
          }
        : {}),
    })

    if (id) {
      // Drop back to select so the thing just placed is immediately
      // manipulable — otherwise the tool is still armed, the next tap makes
      // another object, and the new one cannot be grabbed at all.
      updateTool('select')
      setSelectedId(id)
      // A link needs its URL, which is not inline-editable, so send it to the
      // modal that can collect one.
      if (type === 'link') handleEditItem({ ...EMPTY_ITEM, id, type })
      else if (TYPEABLE_TYPES.includes(type)) setEditingId(id)
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
    setCreateColor(item.color ?? (item.type === 'note' ? NOTE_COLORS[0] : PALETTE[0]))
    setCreateShapeType((item.shapeType as 'rect' | 'circle') ?? 'rect')
    setCreateFontSize(item.fontSize ?? 'md')
    setCreateFontFamily(item.fontFamily ?? 'default')
    setCreateBold(item.bold ?? false)
    setCreateAlign(item.align ?? 'left')
    setCreateModal({ visible: true, type: item.type, vx: item.x, vy: item.y, editItemId: item.id })
  }

  async function handleCreateSubmit() {
    if (!boardId) return
    let newId: string | null = null
    const { type, vx, vy, editItemId, w, h } = createModal
    const sizes = DEFAULT_SIZES[type] ?? { width: 200, height: 100 }
    const textboxFormat = {
      color: createColor,
      fontSize: createFontSize,
      fontFamily: createFontFamily,
      bold: createBold,
      align: createAlign,
    }

    if (editItemId) {
      updateItem(boardId, editItemId, {
        content: createContent,
        ...(type === 'link' ? { url: createUrl } : {}),
        ...(type === 'note' ? { color: createColor } : {}),
        ...(type === 'shape' ? { shapeType: createShapeType, color: createColor } : {}),
        ...(type === 'textbox' ? textboxFormat : {}),
      })
    } else if (type === 'textbox' && w != null && h != null) {
      // Drawn text box — use the drawn geometry verbatim.
      newId = await addItem(boardId, {
        type,
        x: vx,
        y: vy,
        width: w,
        height: h,
        content: createContent,
        ...textboxFormat,
      })
    } else {
      newId = await addItem(boardId, {
        type,
        x: vx - sizes.width / 2,
        y: vy - sizes.height / 2,
        width: sizes.width,
        height: sizes.height,
        content: createContent,
        ...(type === 'link' ? { url: createUrl } : {}),
        ...(type === 'note' ? { color: createColor } : {}),
        ...(type === 'textbox' ? textboxFormat : {}),
      })
    }
    setCreateModal(defaultCreateModal)
    // Leave whatever was just created selected and the select tool active, so
    // it can be moved or resized without a detour through the toolbar. An edit
    // keeps its existing selection.
    if (newId) {
      updateTool('select')
      setSelectedId(newId)
    }
  }

  // Gestures
  const pinch = Gesture.Pinch()
    // With an object selected, a pinch is meant to size that object, and its
    // own Pinch handler sits on an inner detector. Standing this one down
    // stops the board zooming underneath at the same time. Tapping empty
    // space clears the selection and gives zoom back.
    .enabled(!(tool === 'select' && selectedId !== null))
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      sc.value = Math.min(4, Math.max(0.2, savedSc.value * e.scale))
    })
    .onEnd(() => {
      savedSc.value = sc.value
    })

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

  // eslint-disable-next-line react-hooks/refs
  const bgTap = Gesture.Tap()
    .enabled(!readOnly)
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e) => {
      runOnJS(handleBgTap)(e.absoluteX, e.absoluteY)
    })

  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const drawPan = Gesture.Pan()
    .enabled(tool === 'draw')
    .onStart((e) => {
      isDrawing.value = true
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      runOnJS(startStroke)(vx, vy)
    })
    .onUpdate((e) => {
      if (!isDrawing.value) return
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      runOnJS(addPoint)(vx, vy)
    })
    .onEnd(() => {
      if (!isDrawing.value) return
      isDrawing.value = false
      runOnJS(finalizeDraw)()
    })
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const shapeDragPan = Gesture.Pan()
    .enabled(tool === 'shape')
    .onStart((e) => {
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      shapeDragStartX.value = vx
      shapeDragStartY.value = vy
      shapeDragCurX.value = vx
      shapeDragCurY.value = vy
      shapePreviewColor.value = activeColorRef.current
      shapePreviewRadius.value = shapeModeRef.current === 'circle' ? 9999 : 4
      isDraggingShape.value = true
    })
    .onUpdate((e) => {
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      shapeDragCurX.value = vx
      shapeDragCurY.value = vy
    })
    .onEnd(() => {
      isDraggingShape.value = false
      runOnJS(finalizeShape)(
        shapeDragStartX.value,
        shapeDragStartY.value,
        shapeDragCurX.value,
        shapeDragCurY.value
      )
    })

  // Text box: drag to size/place, reusing the shape drag preview (rectangular).
  const textboxDragPan = Gesture.Pan()
    .enabled(tool === 'textbox')
    .onStart((e) => {
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      shapeDragStartX.value = vx
      shapeDragStartY.value = vy
      shapeDragCurX.value = vx
      shapeDragCurY.value = vy
      shapePreviewColor.value = activeColorRef.current
      shapePreviewRadius.value = 4
      isDraggingShape.value = true
    })
    .onUpdate((e) => {
      const vx = (e.absoluteX - tx.value) / sc.value
      const vy = (e.absoluteY - ty.value) / sc.value
      shapeDragCurX.value = vx
      shapeDragCurY.value = vy
    })
    .onEnd(() => {
      isDraggingShape.value = false
      runOnJS(finalizeTextbox)(
        shapeDragStartX.value,
        shapeDragStartY.value,
        shapeDragCurX.value,
        shapeDragCurY.value
      )
    })
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  const panToolGesture = Gesture.Pan()
    .enabled(tool === 'pan')
    .minPointers(1)
    .maxPointers(1)
    // eslint-disable-next-line react-hooks/refs
    .onUpdate((e) => {
      // eslint-disable-next-line react-hooks/immutability
      tx.value = savedTx.value + e.translationX
      // eslint-disable-next-line react-hooks/immutability
      ty.value = savedTy.value + e.translationY
    })
    // eslint-disable-next-line react-hooks/refs
    .onEnd(() => {
      savedTx.value = tx.value
      savedTy.value = ty.value
    })

  const bgGesture = readOnly
    ? (Gesture.Exclusive(bgTap) as ReturnType<typeof Gesture.Exclusive>)
    : Gesture.Race(shapeDragPan, textboxDragPan, drawPan, panToolGesture, bgTap)

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
                backgroundColor: colors.surface,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingTop: insets.top,
              }}
            >
              {/* Tool buttons row */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  paddingHorizontal: 4,
                  paddingTop: 4,
                  paddingBottom: 2,
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
                      setShowColorPicker(false)
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

                {/* Color swatch button */}
                <Pressable
                  onPress={() => setShowColorPicker((v) => !v)}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: showColorPicker ? colors.primary + '22' : 'transparent',
                    alignItems: 'center',
                    minWidth: 44,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: activeColor,
                      borderWidth: 2,
                      borderColor: showColorPicker ? colors.primary : colors.border,
                    }}
                  />
                  <Text fontSize={10} color={colors.textMuted}>
                    Color
                  </Text>
                </Pressable>

                {connectorFrom !== null && (
                  <View style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
                    <Text color={colors.primary} fontSize={11}>
                      Tap target item
                    </Text>
                  </View>
                )}
              </View>

              {/* Color picker panel */}
              {showColorPicker && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    paddingHorizontal: 12,
                    paddingBottom: 8,
                    gap: 8,
                  }}
                >
                  {PALETTE.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => {
                        updateActiveColor(c)
                        setShowColorPicker(false)
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: c,
                          borderWidth: activeColor === c ? 3 : 1,
                          borderColor: activeColor === c ? colors.primary : colors.border,
                        }}
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Shape submenu */}
              {tool === 'shape' && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingBottom: 6,
                    gap: 8,
                  }}
                >
                  <Text color={colors.textMuted} fontSize={12}>
                    Shape:
                  </Text>
                  {(['rect', 'circle'] as const).map((m) => (
                    <Pressable key={m} onPress={() => updateShapeMode(m)}>
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 5,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: shapeMode === m ? colors.primary : colors.border,
                          backgroundColor: shapeMode === m ? colors.primary + '18' : 'transparent',
                        }}
                      >
                        <Text
                          color={shapeMode === m ? colors.primary : colors.text}
                          fontSize={13}
                          fontWeight={shapeMode === m ? '700' : '400'}
                        >
                          {m === 'rect' ? '▭ Rect' : '○ Circle'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                  <Text color={colors.textMuted} fontSize={11}>
                    Drag canvas to draw
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
                          stroke={activeColor}
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

                    {/* Shape drag preview */}
                    <Animated.View style={shapePreviewStyle} pointerEvents="none" />

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
                        editingId={editingId}
                        connectorFrom={connectorFrom}
                        colors={colors}
                        onSelectId={setSelectedId}
                        onStartEdit={setEditingId}
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
              top: (readOnly ? 12 : 60) + insets.top,
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
        {/* The sheet sits against the bottom edge, which is exactly where the
            keyboard appears — without this the Add/Save button is covered. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setCreateModal(defaultCreateModal)}
          >
            <Pressable
              style={[
                styles.modalSheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text color={colors.text} fontWeight="700" fontSize={16} marginBottom={12}>
                {createModal.editItemId
                  ? 'Edit Item'
                  : createModal.type === 'textbox'
                    ? 'Add Text'
                    : `Add ${createModal.type}`}
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
                multiline={createModal.type === 'note' || createModal.type === 'textbox'}
                numberOfLines={
                  createModal.type === 'note' || createModal.type === 'textbox' ? 4 : 1
                }
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
                    <Pressable key={c} onPress={() => setCreateColor(c)}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: c,
                          borderWidth: createColor === c ? 3 : 1,
                          borderColor: createColor === c ? colors.primary : colors.border,
                        }}
                      />
                    </Pressable>
                  ))}
                </XStack>
              )}

              {createModal.type === 'shape' && (
                <>
                  <XStack gap={8} marginTop={10} alignItems="center">
                    <Text color={colors.textMuted} fontSize={12}>
                      Shape:
                    </Text>
                    {(['rect', 'circle'] as const).map((st) => (
                      <Pressable key={st} onPress={() => setCreateShapeType(st)}>
                        <XStack
                          paddingHorizontal={12}
                          paddingVertical={4}
                          borderRadius={6}
                          borderWidth={1}
                          borderColor={createShapeType === st ? colors.primary : colors.border}
                          backgroundColor={createShapeType === st ? colors.primary : 'transparent'}
                        >
                          <Text
                            color={createShapeType === st ? colors.onPrimary : colors.text}
                            fontSize={13}
                          >
                            {st === 'rect' ? '▭ Rect' : '○ Circle'}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>
                  <XStack gap={8} marginTop={8} flexWrap="wrap" alignItems="center">
                    <Text color={colors.textMuted} fontSize={12}>
                      Color:
                    </Text>
                    {PALETTE.map((c) => (
                      <Pressable key={c} onPress={() => setCreateColor(c)}>
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: c,
                            borderWidth: createColor === c ? 3 : 1,
                            borderColor: createColor === c ? colors.primary : colors.border,
                          }}
                        />
                      </Pressable>
                    ))}
                  </XStack>
                </>
              )}

              {createModal.type === 'textbox' && (
                <>
                  {/* Font size */}
                  <XStack gap={8} marginTop={10} alignItems="center">
                    <Text color={colors.textMuted} fontSize={12}>
                      Size:
                    </Text>
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <Pressable key={opt.key} onPress={() => setCreateFontSize(opt.key)}>
                        <XStack
                          paddingHorizontal={12}
                          paddingVertical={4}
                          borderRadius={6}
                          borderWidth={1}
                          borderColor={createFontSize === opt.key ? colors.primary : colors.border}
                          backgroundColor={
                            createFontSize === opt.key ? colors.primary : 'transparent'
                          }
                        >
                          <Text
                            color={createFontSize === opt.key ? colors.onPrimary : colors.text}
                            fontSize={13}
                          >
                            {opt.label}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>

                  {/* Typeface */}
                  <XStack gap={8} marginTop={8} flexWrap="wrap" alignItems="center">
                    <Text color={colors.textMuted} fontSize={12}>
                      Font:
                    </Text>
                    {FONT_FAMILY_OPTIONS.map((opt) => (
                      <Pressable key={opt.key} onPress={() => setCreateFontFamily(opt.key)}>
                        <XStack
                          paddingHorizontal={12}
                          paddingVertical={4}
                          borderRadius={6}
                          borderWidth={1}
                          borderColor={
                            createFontFamily === opt.key ? colors.primary : colors.border
                          }
                          backgroundColor={
                            createFontFamily === opt.key ? colors.primary : 'transparent'
                          }
                        >
                          <Text
                            fontSize={13}
                            style={{
                              color: createFontFamily === opt.key ? colors.onPrimary : colors.text,
                              fontFamily: textFontFamily(opt.key),
                            }}
                          >
                            {opt.label}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>

                  {/* Bold + alignment */}
                  <XStack gap={8} marginTop={8} alignItems="center">
                    <Pressable onPress={() => setCreateBold((b) => !b)}>
                      <XStack
                        paddingHorizontal={12}
                        paddingVertical={4}
                        borderRadius={6}
                        borderWidth={1}
                        borderColor={createBold ? colors.primary : colors.border}
                        backgroundColor={createBold ? colors.primary : 'transparent'}
                      >
                        <Text
                          color={createBold ? colors.onPrimary : colors.text}
                          fontSize={13}
                          fontWeight="700"
                        >
                          B
                        </Text>
                      </XStack>
                    </Pressable>
                    {(['left', 'center'] as const).map((al) => (
                      <Pressable key={al} onPress={() => setCreateAlign(al)}>
                        <XStack
                          paddingHorizontal={12}
                          paddingVertical={4}
                          borderRadius={6}
                          borderWidth={1}
                          borderColor={createAlign === al ? colors.primary : colors.border}
                          backgroundColor={createAlign === al ? colors.primary : 'transparent'}
                        >
                          <Text
                            color={createAlign === al ? colors.onPrimary : colors.text}
                            fontSize={13}
                          >
                            {al === 'left' ? '⬅ Left' : '☰ Center'}
                          </Text>
                        </XStack>
                      </Pressable>
                    ))}
                  </XStack>

                  {/* Text color */}
                  <XStack gap={8} marginTop={8} flexWrap="wrap" alignItems="center">
                    <Text color={colors.textMuted} fontSize={12}>
                      Color:
                    </Text>
                    {PALETTE.map((c) => (
                      <Pressable key={c} onPress={() => setCreateColor(c)}>
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: c,
                            borderWidth: createColor === c ? 3 : 1,
                            borderColor: createColor === c ? colors.primary : colors.border,
                          }}
                        />
                      </Pressable>
                    ))}
                  </XStack>
                </>
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
                    {createModal.editItemId ? 'Update' : 'Add'}
                  </Text>
                </Pressable>
              </XStack>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
