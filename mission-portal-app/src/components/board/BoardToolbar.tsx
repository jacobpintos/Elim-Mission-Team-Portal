import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native'
import { useThemeColors } from '@/theme/useThemeColors'

export type Tool =
  | 'select' | 'pan'
  | 'sticky' | 'text' | 'box' | 'arrow'
  | 'pin' | 'pen' | 'image'

const PRESET_STROKE_COLORS = [
  '#f0ece4', '#e8624a', '#2980b9', '#27ae60',
  '#e67e22', '#8e44ad', '#e74c3c', '#f39c12',
]
const PRESET_STICKY_COLORS = [
  '#fffde7', '#e3f2fd', '#e8f5e9',
  '#fce4ec', '#f3e5f5', '#e0f7fa',
]
const STROKE_WIDTHS = [1, 2, 3, 4, 6, 8, 12]

const TOOL_ICONS: Record<Tool, string> = {
  select: '↖', pan: '✋', sticky: '📝', text: 'T',
  box: '□', arrow: '→', pin: '📍', pen: '✏️', image: '🖼',
}
const TOOL_TIPS: Record<Tool, string> = {
  select: 'Select', pan: 'Pan', sticky: 'Sticky', text: 'Text',
  box: 'Box', arrow: 'Arrow', pin: 'Pin', pen: 'Pen', image: 'Image',
}

interface ToolbarProps {
  activeTool:        Tool
  onChangeTool:      (t: Tool) => void
  strokeColor:       string
  onStrokeColor:     (c: string) => void
  stickyColor:       string
  onStickyColor:     (c: string) => void
  strokeWidth:       number
  onStrokeWidth:     (w: number) => void
  selectedElementId: string | null
  onDeleteSelected:  () => void
}

export default function BoardToolbar({
  activeTool, onChangeTool,
  strokeColor, onStrokeColor,
  stickyColor, onStickyColor,
  strokeWidth, onStrokeWidth,
  selectedElementId, onDeleteSelected,
}: ToolbarProps) {
  const colors = useThemeColors()
  const [expanded, setExpanded] = useState(false)

  const showColorPicker = ['pen', 'box', 'arrow', 'sticky'].includes(activeTool)

  const TOOL_HINT: Record<string, string> = {
    box: 'Drag to draw a box',
    arrow: 'Drag from start to end point',
    pen: 'Draw freely on the canvas',
  }

  return (
    <View style={[tb.container, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {/* Tool row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tb.toolRow}>
        {(Object.keys(TOOL_ICONS) as Tool[]).map(tool => (
          <TouchableOpacity
            key={tool}
            style={[tb.toolBtn, { borderColor: colors.border }, activeTool === tool && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => onChangeTool(tool)}
            accessibilityLabel={TOOL_TIPS[tool]}
          >
            <Text style={{ fontSize: 17, color: activeTool === tool ? '#fff' : colors.text }}>
              {TOOL_ICONS[tool]}
            </Text>
          </TouchableOpacity>
        ))}

        {selectedElementId && (
          <TouchableOpacity
            style={[tb.toolBtn, { backgroundColor: '#e74c3c', borderColor: '#e74c3c', marginLeft: 8 }]}
            onPress={onDeleteSelected}
            accessibilityLabel="Delete selected"
          >
            <Text style={{ fontSize: 17, color: '#fff' }}>🗑</Text>
          </TouchableOpacity>
        )}

        {showColorPicker && (
          <TouchableOpacity
            style={[tb.toolBtn, { borderColor: colors.border, marginLeft: 6 }, expanded && { backgroundColor: colors.primary + '33' }]}
            onPress={() => setExpanded(e => !e)}
            accessibilityLabel="Color picker"
          >
            <Text style={{ fontSize: 17, color: colors.text }}>🎨</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Color / width pickers */}
      {showColorPicker && expanded && (
        <View style={[tb.pickerPanel, { borderTopColor: colors.border }]}>
          {activeTool === 'sticky' ? (
            <>
              <Text style={[tb.pickerLabel, { color: colors.textMuted }]}>Background</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {PRESET_STICKY_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      tb.swatch,
                      { backgroundColor: c },
                      stickyColor === c && { borderColor: colors.primary, borderWidth: 3 },
                    ]}
                    onPress={() => onStickyColor(c)}
                  />
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <Text style={[tb.pickerLabel, { color: colors.textMuted }]}>Stroke color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {PRESET_STROKE_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      tb.swatch,
                      { backgroundColor: c, borderColor: strokeColor === c ? colors.primary : 'rgba(255,255,255,0.3)' },
                      strokeColor === c && { borderWidth: 3 },
                    ]}
                    onPress={() => onStrokeColor(c)}
                  />
                ))}
              </ScrollView>
              <Text style={[tb.pickerLabel, { color: colors.textMuted }]}>Width: {strokeWidth}px</Text>
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4, marginTop: 4 }}>
                {STROKE_WIDTHS.map(w => (
                  <TouchableOpacity
                    key={w}
                    style={[
                      tb.widthBtn,
                      { borderColor: colors.border },
                      strokeWidth === w && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => onStrokeWidth(w)}
                  >
                    <Text style={{ color: strokeWidth === w ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* Tool hint for draw tools */}
      {TOOL_HINT[activeTool] && (
        <Text style={[tb.hint, { color: colors.textMuted }]}>{TOOL_HINT[activeTool]}</Text>
      )}
    </View>
  )
}

const tb = StyleSheet.create({
  container: { borderTopWidth: 1, paddingBottom: 4 },
  toolRow: { flexDirection: 'row', padding: 8, gap: 6, alignItems: 'center' },
  toolBtn: {
    width: 44, height: 44, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  pickerPanel: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 6, borderTopWidth: 1 },
  pickerLabel: { fontSize: 11, marginBottom: 6 },
  swatch: {
    width: 28, height: 28, borderRadius: 14,
    marginRight: 7, borderWidth: 1, borderColor: 'transparent',
  },
  widthBtn: {
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, minWidth: 30, alignItems: 'center',
  },
  hint: { textAlign: 'center', fontSize: 11, paddingBottom: 6, paddingTop: 2 },
})
