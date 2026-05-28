import { useState, useEffect } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Button, Input, Checkbox, Label, Spinner } from 'tamagui'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { isAdmin } from '@/lib/roles'
import { usePageBuilderStore } from '@/stores/pageBuilderStore'
import { BlockCard } from './BlockCard'
import { BlockPalette } from './BlockPalette'
import { HeroBlock } from './BlockRenderer/HeroBlock'
import { TextBlock } from './BlockRenderer/TextBlock'
import { ImageBlock } from './BlockRenderer/ImageBlock'
import { TwoColBlock } from './BlockRenderer/TwoColBlock'
import { TimelineBlock } from './BlockRenderer/TimelineBlock'
import { ButtonBlock } from './BlockRenderer/ButtonBlock'
import { DividerBlock } from './BlockRenderer/DividerBlock'
import { MeetingBlock } from './BlockRenderer/MeetingBlock'
import { SocialBlock } from './BlockRenderer/SocialBlock'
import { useUIStore } from '@/stores/uiStore'
import type { PageBlock, PageData } from '@/types/pages'

type PageKey = 'ourstory' | 'connect' | 'giving'

interface PageBuilderScreenProps {
  pageKey: PageKey
  pageTitle: string
}

function renderBlock(block: PageBlock) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock key={block.id} data={block.data as never} />
    case 'text':
      return <TextBlock key={block.id} data={block.data as never} />
    case 'image':
      return <ImageBlock key={block.id} data={block.data as never} />
    case 'twocol':
      return <TwoColBlock key={block.id} data={block.data as never} />
    case 'timeline':
      return <TimelineBlock key={block.id} data={block.data as never} />
    case 'button':
      return <ButtonBlock key={block.id} data={block.data as never} />
    case 'divider':
      return <DividerBlock key={block.id} />
    case 'meeting':
      return <MeetingBlock key={block.id} data={block.data as never} />
    case 'social':
      return <SocialBlock key={block.id} data={block.data as never} />
    default:
      return null
  }
}

export function PageBuilderScreen({ pageKey, pageTitle }: PageBuilderScreenProps) {
  const { profile } = useAuthStore()
  const { buildModeKey, setBuildMode } = usePageBuilderStore()
  const { toast } = useUIStore()

  const isBuildMode = buildModeKey === pageKey
  const canBuild = isAdmin(profile)

  const [pageData, setPageData] = useState<PageData>({
    blocks: [],
    bgImage: null,
    bgParallax: false,
  })
  const [localBlocks, setLocalBlocks] = useState<PageBlock[]>([])
  const [bgImageInput, setBgImageInput] = useState('')
  const [bgParallax, setBgParallax] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      const page = data?.publicPages?.[pageKey] as PageData | undefined
      const blocks = page?.blocks ?? []
      const bgImage = page?.bgImage ?? null
      const bgParallaxVal = page?.bgParallax ?? false

      setPageData({ blocks, bgImage, bgParallax: bgParallaxVal })
      setLocalBlocks(blocks)
      setBgImageInput(bgImage ?? '')
      setBgParallax(bgParallaxVal)
      setLoading(false)
    })
    return () => unsub()
  }, [pageKey])

  const saveBlocks = async (blocks: PageBlock[]) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        [`publicPages.${pageKey}`]: {
          blocks,
          bgImage: bgImageInput || null,
          bgParallax,
        },
      })
      toast('Page saved!', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const savePage = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        [`publicPages.${pageKey}`]: {
          blocks: localBlocks,
          bgImage: bgImageInput || null,
          bgParallax,
        },
      })
      toast('Page settings saved!', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleBlockChange = (index: number, block: PageBlock) => {
    const updated = [...localBlocks]
    updated[index] = block
    setLocalBlocks(updated)
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const updated = [...localBlocks]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    setLocalBlocks(updated)
  }

  const handleMoveDown = (index: number) => {
    if (index === localBlocks.length - 1) return
    const updated = [...localBlocks]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    setLocalBlocks(updated)
  }

  const handleDeleteBlock = (index: number) => {
    const updated = localBlocks.filter((_, i) => i !== index)
    setLocalBlocks(updated)
  }

  const handleAddBlock = (block: PageBlock) => {
    setLocalBlocks([...localBlocks, block])
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    )
  }

  if (isBuildMode && canBuild) {
    return (
      <ScrollView>
        <YStack flex={1} padding="$3" gap="$3">
          {/* Build mode header */}
          <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="$2">
            <Text fontSize="$5" fontWeight="700">
              {pageTitle} — Build Mode
            </Text>
            <XStack gap="$2">
              {saving && <Spinner size="small" />}
              <Button size="$3" onPress={() => setBuildMode(null)} theme="gray">
                Exit Build Mode
              </Button>
            </XStack>
          </XStack>

          {/* Page background bar */}
          <YStack
            backgroundColor="$gray2"
            borderRadius="$2"
            padding="$2"
            gap="$2"
          >
            <Text fontWeight="600" fontSize="$3">
              Page Background
            </Text>
            <Input
              placeholder="Background image URL"
              value={bgImageInput}
              onChangeText={setBgImageInput}
              size="$3"
              autoCapitalize="none"
            />
            <XStack alignItems="center" gap="$2">
              <Checkbox
                id="bg-parallax"
                checked={bgParallax}
                onCheckedChange={(v) => setBgParallax(v === true)}
                size="$3"
              >
                <Checkbox.Indicator>
                  <Text>✓</Text>
                </Checkbox.Indicator>
              </Checkbox>
              <Label htmlFor="bg-parallax" fontSize="$3">
                Parallax effect
              </Label>
              <Button size="$2" onPress={savePage} theme="active" marginLeft="auto">
                Save Page
              </Button>
            </XStack>
          </YStack>

          {/* Block palette */}
          <YStack>
            <Text fontWeight="600" fontSize="$3" marginBottom="$1">
              Add Block
            </Text>
            <BlockPalette onAdd={handleAddBlock} />
          </YStack>

          {/* Block cards */}
          {localBlocks.map((block, index) => (
            <BlockCard
              key={block.id}
              block={block}
              index={index}
              total={localBlocks.length}
              onChange={(b) => handleBlockChange(index, b)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onSave={() => saveBlocks(localBlocks)}
              onDelete={() => handleDeleteBlock(index)}
            />
          ))}

          {localBlocks.length === 0 && (
            <YStack
              padding="$6"
              alignItems="center"
              backgroundColor="$gray2"
              borderRadius="$3"
            >
              <Text color="$gray10" fontSize="$4">
                No blocks yet. Add one above.
              </Text>
            </YStack>
          )}
        </YStack>
      </ScrollView>
    )
  }

  // View mode
  return (
    <ScrollView>
      <YStack flex={1}>
        {/* Admin toggle */}
        {canBuild && (
          <XStack padding="$3" justifyContent="flex-end">
            <Button size="$2" onPress={() => setBuildMode(pageKey)} theme="active">
              Edit Page
            </Button>
          </XStack>
        )}

        {/* Render blocks */}
        {pageData.blocks.length > 0 ? (
          pageData.blocks.map((block) => renderBlock(block))
        ) : (
          <YStack padding="$8" alignItems="center" justifyContent="center">
            <Text fontSize="$5" fontWeight="700" marginBottom="$2">
              {pageTitle}
            </Text>
            <Text color="$gray10" fontSize="$3">
              {canBuild ? 'No content yet. Click "Edit Page" to add blocks.' : 'Coming soon.'}
            </Text>
          </YStack>
        )}
      </YStack>
    </ScrollView>
  )
}
