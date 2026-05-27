import { ScrollView } from 'react-native'
import { XStack, Button, Text } from 'tamagui'
import type { PageBlock, PageBlockType } from '@/types/pages'

const BLOCK_TYPES: Array<{ type: PageBlockType; label: string }> = [
  { type: 'hero', label: 'Hero' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'twocol', label: 'Two Column' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'button', label: 'Button' },
  { type: 'divider', label: 'Divider' },
  { type: 'meeting', label: 'Meeting' },
  { type: 'social', label: 'Social' },
]

interface BlockPaletteProps {
  onAdd: (block: PageBlock) => void
}

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  const addBlock = (type: PageBlockType) => {
    onAdd({ id: Date.now(), type, data: {} })
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}
    >
      <XStack gap="$2">
        {BLOCK_TYPES.map((bt) => (
          <Button
            key={bt.type}
            size="$2"
            onPress={() => addBlock(bt.type)}
            theme="active"
          >
            <Text fontSize="$2" color="white" fontWeight="600">
              + {bt.label}
            </Text>
          </Button>
        ))}
      </XStack>
    </ScrollView>
  )
}
