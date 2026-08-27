import { YStack, XStack, Text, Button } from 'tamagui'
import { HeroEditor } from './BlockEditor/HeroEditor'
import { TextEditor } from './BlockEditor/TextEditor'
import { ImageEditor } from './BlockEditor/ImageEditor'
import { EmbedEditor } from './BlockEditor/EmbedEditor'
import { QuoteEditor } from './BlockEditor/QuoteEditor'
import { GalleryEditor } from './BlockEditor/GalleryEditor'
import { TwoColEditor } from './BlockEditor/TwoColEditor'
import { TimelineEditor } from './BlockEditor/TimelineEditor'
import { ButtonEditor } from './BlockEditor/ButtonEditor'
import { DividerEditor } from './BlockEditor/DividerEditor'
import { MeetingEditor } from './BlockEditor/MeetingEditor'
import { SocialEditor } from './BlockEditor/SocialEditor'
import type { PageBlock } from '@/types/pages'

const BLOCK_COLORS: Record<string, string> = {
  hero: '#f56c5a',
  text: '#2980b9',
  image: '#27ae60',
  twocol: '#8e44ad',
  timeline: '#d35400',
  button: '#16a085',
  divider: '#7f8c8d',
  meeting: '#c0392b',
  social: '#2c3e50',
}

interface BlockCardProps {
  block: PageBlock
  /** Which page this block belongs to, so uploaded pictures land beside it. */
  pageKey: string
  index: number
  total: number
  onChange: (block: PageBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onSave: () => void
  onDelete: () => void
}

export function BlockCard({
  block,
  pageKey,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: BlockCardProps) {
  const color = BLOCK_COLORS[block.type] ?? '#888'

  const renderEditor = () => {
    switch (block.type) {
      case 'hero':
        return (
          <HeroEditor
            data={block.data as never}
            pageKey={pageKey}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'text':
        return (
          <TextEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'image':
        return (
          <ImageEditor
            data={block.data as never}
            pageKey={pageKey}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'embed':
        return (
          <EmbedEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'quote':
        return (
          <QuoteEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'gallery':
        return (
          <GalleryEditor
            data={block.data as never}
            pageKey={pageKey}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'twocol':
        return (
          <TwoColEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'timeline':
        return (
          <TimelineEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'button':
        return (
          <ButtonEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'divider':
        return <DividerEditor />
      case 'meeting':
        return (
          <MeetingEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      case 'social':
        return (
          <SocialEditor
            data={block.data as never}
            onChange={(d) => onChange({ ...block, data: d })}
          />
        )
      default:
        return null
    }
  }

  return (
    <YStack
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      overflow="hidden"
      marginBottom="$3"
    >
      {/* Header */}
      <XStack
        padding="$2"
        backgroundColor={color + '22'}
        alignItems="center"
        justifyContent="space-between"
      >
        <XStack alignItems="center" gap="$2">
          <XStack
            backgroundColor={color}
            borderRadius="$4"
            paddingHorizontal="$2"
            paddingVertical="$0.5"
          >
            <Text fontSize="$1" color="white" fontWeight="700" textTransform="uppercase">
              {block.type}
            </Text>
          </XStack>
        </XStack>

        <XStack gap="$1" alignItems="center">
          <Button
            size="$1"
            onPress={onMoveUp}
            disabled={index === 0}
            theme="gray"
            opacity={index === 0 ? 0.4 : 1}
          >
            ↑
          </Button>
          <Button
            size="$1"
            onPress={onMoveDown}
            disabled={index === total - 1}
            theme="gray"
            opacity={index === total - 1 ? 0.4 : 1}
          >
            ↓
          </Button>
          <Button size="$1" onPress={onSave} theme="active">
            Save
          </Button>
          <Button size="$1" onPress={onDelete} theme="red">
            Delete
          </Button>
        </XStack>
      </XStack>

      {/* Editor */}
      <YStack padding="$3">{renderEditor()}</YStack>
    </YStack>
  )
}
