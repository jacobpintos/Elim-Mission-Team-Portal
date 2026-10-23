import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Image } from 'expo-image'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { Arrow, BrandMark, INK, Overline, SERIF } from '@/components/ui/Brand'
import { openExternalUrl } from '@/lib/externalUrl'
import { isAdmin } from '@/lib/roles'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { autoTextColor } from '@/theme/contrast'
import { useThemeColors } from '@/theme/useThemeColors'
import { ELIM_STORE_URL, type StoreItem, type StoreShelf } from './storeContent'
import { saleEndsLabel, type StoreSale } from './storeSale'
import { storeImageSource } from './storeImages'
import { useElimStore } from './useElimStore'
import { StoreEditor } from './StoreEditor'
import { SaleEditor } from './SaleEditor'
import { SaleNotifyOption } from './SaleNotifyOption'

const GAP = 16
const WHITE_MUTED = 'rgba(255,255,255,0.72)'

/**
 * A photo of something in the store, which opens it there.
 *
 * Should the photo not load — a moved file, a blocked host — the tile keeps
 * its place and shows the item's name instead, so the grid never has a hole
 * in it and the link still works.
 */
function ItemTile({
  item,
  width,
  ratio,
  ground,
  textColor,
  fallbackColor,
}: {
  item: StoreItem
  width: number
  ratio: number
  ground: string
  textColor: string
  /** The name's colour on the tile when the photo cannot be shown. */
  fallbackColor: string
}) {
  const [failed, setFailed] = useState(false)
  const source = storeImageSource(item.image)
  return (
    <Pressable
      onPress={() => openExternalUrl(item.url || ELIM_STORE_URL)}
      accessibilityRole="link"
      accessibilityLabel={`${item.title} at the Elim Store`}
      style={(state) => ({ width, opacity: state.pressed ? 0.85 : 1 })}
    >
      <YStack gap={10}>
        <View
          style={{
            width,
            height: Math.round(width * ratio),
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: ground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {failed || !source ? (
            <Text
              color={fallbackColor}
              fontSize={13}
              fontWeight="800"
              textAlign="center"
              padding={8}
            >
              {item.title}
            </Text>
          ) : (
            <Image
              source={source}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              onError={() => setFailed(true)}
            />
          )}
        </View>
        <Text color={textColor} fontSize={13} lineHeight={18} fontWeight="600" numberOfLines={3}>
          {item.title}
        </Text>
      </YStack>
    </Pressable>
  )
}

/** A kind of thing the store sells: what it is, a few featured pieces, and the way to the rest. */
function Shelf({ shelf, column, wide }: { shelf: StoreShelf; column: number; wide: boolean }) {
  const colors = useThemeColors()
  const portrait = shelf.shape === 'portrait'
  const columns = wide ? 6 : column >= 480 ? (portrait ? 4 : 3) : portrait ? 3 : 2
  const tile = Math.floor((column - GAP * (columns - 1)) / columns)

  return (
    <YStack gap={16}>
      <YStack gap={6} maxWidth={640}>
        <Overline color={colors.primary}>Featured</Overline>
        {shelf.title ? (
          <Text color={colors.text} fontSize={wide ? 26 : 22} fontWeight="800" letterSpacing={-0.3}>
            {shelf.title}
          </Text>
        ) : null}
        {shelf.body ? (
          <Text color={colors.textMuted} fontSize={15} lineHeight={23}>
            {shelf.body}
          </Text>
        ) : null}
      </YStack>
      {shelf.items.length ? (
        <XStack flexWrap="wrap" gap={GAP}>
          {shelf.items.map((item) => (
            <ItemTile
              key={item.id}
              item={item}
              width={tile}
              ratio={portrait ? 1.5 : 1}
              // Product photos are shot on white, so clothing sits on a light
              // tile in either theme; covers fill theirs edge to edge.
              ground={portrait ? colors.primary + '26' : '#f2f2f2'}
              textColor={colors.text}
              fallbackColor={portrait ? colors.text : '#1a1a2e'}
            />
          ))}
        </XStack>
      ) : null}
      <Pressable onPress={() => openExternalUrl(ELIM_STORE_URL)} accessibilityRole="link">
        <XStack alignItems="center" gap={8}>
          <Text color={colors.primary} fontSize={15} fontWeight="800">
            See more at theelimstore.com
          </Text>
          <Arrow color={colors.primary} />
        </XStack>
      </Pressable>
    </YStack>
  )
}

/** The sale running now, across the top, with when it ends. */
function SaleBanner({ sale, gutter }: { sale: StoreSale; gutter: number }) {
  const primary = useThemeStore((s) => s.theme.primary)
  const override = useThemeStore((s) => s.theme.onPrimaryOverride)
  const on = override ?? autoTextColor(primary)
  return (
    <Pressable
      onPress={() => openExternalUrl(ELIM_STORE_URL)}
      accessibilityRole="link"
      accessibilityLabel={`Sale: ${sale.message}. ${saleEndsLabel(sale.endsOn)}.`}
    >
      <XStack
        backgroundColor={primary}
        paddingHorizontal={gutter}
        paddingVertical={14}
        gap={12}
        alignItems="center"
      >
        <YStack
          backgroundColor={on}
          borderRadius={6}
          paddingHorizontal={8}
          paddingVertical={4}
          alignSelf="flex-start"
          marginTop={2}
        >
          <Text color={primary} fontSize={11} fontWeight="900" letterSpacing={1.5}>
            SALE
          </Text>
        </YStack>
        <YStack flex={1} gap={2}>
          <Text color={on} fontSize={16} lineHeight={22} fontWeight="800">
            {sale.message}
          </Text>
          <Text color={on} opacity={0.85} fontSize={13} fontWeight="600">
            {saleEndsLabel(sale.endsOn)}
          </Text>
        </YStack>
        <Arrow color={on} />
      </XStack>
    </Pressable>
  )
}

/**
 * The Elim Store tab.
 *
 * A dark band carrying the logo's mark and the store's name, set in a serif
 * after its own lettering, with its line about itself and a way straight
 * there; then the featured pieces, one shelf for the handmade clothing and
 * one for Pastor Ajai's books. What is here is a selection and says so —
 * every shelf is marked as featured and ends in a link to the rest — because
 * the store carries far more than a phone screen should.
 *
 * A sale, while one runs, sits above everything with the day it ends. Admins
 * get two buttons over the page: one for the shelves and wording, one for the
 * sale.
 */
export function ElimStoreScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const admin = isAdmin(profile)
  const onPrimary = useThemeStore((s) => s.theme.onPrimaryOverride) ?? autoTextColor(colors.primary)
  const { store, ourStory, sale } = useElimStore()
  const [width, setWidth] = useState(0)
  const [editing, setEditing] = useState<'store' | 'sale' | null>(null)

  if (!store) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    )
  }

  const wide = width >= 720
  const gutter = wide ? 40 : 20
  const column = Math.min(width, 1040) - gutter * 2

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {admin ? (
          <XStack
            paddingHorizontal={gutter}
            paddingVertical={10}
            gap={10}
            justifyContent="flex-end"
          >
            <Pressable onPress={() => setEditing('sale')} accessibilityRole="button">
              <XStack
                borderWidth={1}
                borderColor={colors.border}
                borderRadius={8}
                paddingHorizontal={12}
                paddingVertical={7}
              >
                <Text color={colors.text} fontSize={13} fontWeight="700">
                  {sale ? 'Edit sale' : 'Post a sale'}
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={() => setEditing('store')} accessibilityRole="button">
              <XStack
                backgroundColor={colors.primary}
                borderRadius={8}
                paddingHorizontal={12}
                paddingVertical={7}
              >
                <Text color={onPrimary} fontSize={13} fontWeight="700">
                  Edit store
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        ) : null}

        {sale ? <SaleBanner sale={sale} gutter={gutter} /> : null}

        {/* The store's name and what it is for. */}
        <View style={{ width: '100%', backgroundColor: INK, overflow: 'hidden' }}>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: wide ? -60 : -150, bottom: -50, opacity: 0.06 }}
          >
            <BrandMark color={colors.primary} height={wide ? 340 : 240} />
          </View>
          <YStack
            width="100%"
            maxWidth={1040}
            alignSelf="center"
            paddingHorizontal={gutter}
            paddingTop={wide ? 72 : 48}
            paddingBottom={wide ? 64 : 44}
            gap={14}
          >
            <BrandMark color={colors.primary} height={18} />
            <Text
              color="#ffffff"
              fontFamily={SERIF}
              fontSize={wide ? 56 : 40}
              lineHeight={wide ? 60 : 44}
              letterSpacing={wide ? -1 : -0.5}
            >
              THE ELIM STORE
            </Text>
            {store.tagline ? (
              <Text color="#ffffff" fontSize={wide ? 20 : 17} lineHeight={wide ? 29 : 25}>
                {store.tagline}
              </Text>
            ) : null}
            {store.intro ? (
              <Text
                color={WHITE_MUTED}
                fontSize={wide ? 17 : 16}
                lineHeight={wide ? 28 : 26}
                maxWidth={640}
              >
                {store.intro}
              </Text>
            ) : null}
            <XStack marginTop={10} gap={16} alignItems="center" flexWrap="wrap">
              <Pressable
                onPress={() => openExternalUrl(ELIM_STORE_URL)}
                accessibilityRole="link"
                accessibilityLabel="Visit the Elim Store"
              >
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius={999}
                  paddingHorizontal={24}
                  paddingVertical={14}
                  gap={10}
                  alignItems="center"
                >
                  <Text color={onPrimary} fontSize={16} fontWeight="800" letterSpacing={0.3}>
                    Visit the Elim Store
                  </Text>
                  <Arrow color={onPrimary} />
                </XStack>
              </Pressable>
              <Text color="rgba(255,255,255,0.55)" fontSize={14}>
                theelimstore.com
              </Text>
            </XStack>
          </YStack>
        </View>

        <YStack
          width="100%"
          maxWidth={1040}
          alignSelf="center"
          paddingHorizontal={gutter}
          paddingTop={wide ? 48 : 32}
          paddingBottom={wide ? 64 : 48}
          gap={wide ? 56 : 44}
        >
          {store.shelves.map((shelf) => (
            <Shelf key={shelf.id} shelf={shelf} column={column} wide={wide} />
          ))}

          <SaleNotifyOption />
        </YStack>
      </ScrollView>

      {editing === 'store' ? (
        <StoreEditor store={store} ourStory={ourStory} onClose={() => setEditing(null)} />
      ) : null}
      {editing === 'sale' ? <SaleEditor sale={sale} onClose={() => setEditing(null)} /> : null}
    </>
  )
}
