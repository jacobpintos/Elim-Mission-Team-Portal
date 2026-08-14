import { useEffect, useRef, useState, useMemo } from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useRouter } from 'expo-router'
import mapboxgl from 'mapbox-gl'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { allInstances } from '@/lib/events'
import { haversineMiles } from '@/lib/geocode'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

const HOME_LAT = 41.7491
const HOME_LNG = -91.5779

type LocationGroup = {
  key: string
  lat: number
  lng: number
  names: string[]
  trips: number
  onewayMi: number
}

export default function EventsMapScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const { templates, overrides, subscribe } = useEventsStore()

  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)

  const defaultStart = () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [deselected, setDeselected] = useState<Set<string>>(new Set())

  useEffect(() => {
    subscribe()
  }, [])

  useEffect(() => {
    if (profile && !isAdmin(profile)) {
      router.replace('/(app)/events' as never)
    }
  }, [profile])

  // Build location groups from all instances in range
  const allLocGroups = useMemo<LocationGroup[]>(() => {
    const instances = allInstances(templates, overrides, startDate, endDate)
    const locMap = new Map<
      string,
      { lat: number; lng: number; names: Set<string>; trips: number }
    >()

    for (const ev of instances) {
      const lat = ev._geocodeLat
      const lng = ev._geocodeLng
      if (!lat || !lng || ev.isVirtual) continue
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
      if (!locMap.has(key)) locMap.set(key, { lat, lng, names: new Set(), trips: 0 })
      const loc = locMap.get(key)!
      loc.names.add(ev.title)
      loc.trips++
    }

    return Array.from(locMap.entries())
      .map(([key, { lat, lng, names, trips }]) => ({
        key,
        lat,
        lng,
        names: Array.from(names),
        trips,
        onewayMi: haversineMiles(HOME_LAT, HOME_LNG, lat, lng),
      }))
      .sort((a, b) => a.onewayMi - b.onewayMi)
  }, [templates, overrides, startDate, endDate])

  // Active (selected) groups
  const activeGroups = useMemo(
    () => allLocGroups.filter((g) => !deselected.has(g.key)),
    [allLocGroups, deselected]
  )

  const totalMiles = useMemo(
    () => Math.round(activeGroups.reduce((sum, g) => sum + g.onewayMi * 2 * g.trips, 0)),
    [activeGroups]
  )
  const totalTrips = useMemo(
    () => activeGroups.reduce((sum, g) => sum + g.trips, 0),
    [activeGroups]
  )

  const allSelected = deselected.size === 0
  const toggleAll = () => {
    setDeselected(allSelected ? new Set(allLocGroups.map((g) => g.key)) : new Set())
  }
  const toggleGroup = (key: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Inject Mapbox CSS
  useEffect(() => {
    const id = 'mapbox-gl-css'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css'
      document.head.appendChild(link)
    }
  }, [])

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''
    if (!token) return

    mapboxgl.accessToken = token
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [HOME_LNG, HOME_LAT],
      zoom: 6.2,
    })

    map.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    // Home marker
    const homeEl = document.createElement('div')
    homeEl.style.cssText = [
      'width:14px',
      'height:14px',
      'background:#2980b9',
      'border:3px solid white',
      'border-radius:50%',
      'box-shadow:0 1px 6px rgba(0,0,0,0.4)',
    ].join(';')
    new mapboxgl.Marker({ element: homeEl })
      .setLngLat([HOME_LNG, HOME_LAT])
      .setPopup(
        new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
          '<div style="font-family:system-ui;font-size:12px;"><strong>North Liberty, IA</strong><br/>Mission departure point</div>'
        )
      )
      .addTo(map.current)

    map.current.on('load', () => {
      map.current!.addLayer(
        {
          id: 'us-state-borders',
          type: 'line',
          source: 'composite',
          'source-layer': 'admin',
          filter: ['==', ['get', 'admin_level'], 1],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#5a7db5',
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2.5],
            'line-opacity': 0.85,
          },
        },
        'road-label'
      )
      setMapReady(true)
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Update markers whenever active groups change
  useEffect(() => {
    if (!mapReady || !map.current) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (activeGroups.length === 0) {
      map.current.flyTo({ center: [HOME_LNG, HOME_LAT], zoom: 6.2, duration: 800 })
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([HOME_LNG, HOME_LAT])

    for (const { lat, lng, names, trips, onewayMi } of activeGroups) {
      const el = document.createElement('div')
      el.style.cssText = [
        'width:26px',
        'height:26px',
        'background:#f56c5a',
        'border:3px solid white',
        'border-radius:50% 50% 50% 0',
        'transform:rotate(-45deg)',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
        'cursor:pointer',
        'transition:transform 0.15s ease',
      ].join(';')
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'rotate(-45deg) scale(1.25)'
      })
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'rotate(-45deg) scale(1)'
      })

      const nameHtml = names.map((n) => `<strong>${n}</strong>`).join('<br/>')
      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false, maxWidth: '220px' })
        .setHTML(`
          <div style="font-family:system-ui;padding:2px 4px;">
            ${nameHtml}
            <div style="margin-top:4px;color:#666;font-size:12px;">
              ${trips} trip${trips !== 1 ? 's' : ''} &nbsp;·&nbsp; ${Math.round(onewayMi)} mi one-way
            </div>
          </div>
        `)

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!)

      markersRef.current.push(marker)
      bounds.extend([lng, lat])
    }

    if (activeGroups.length === 1) {
      const g = activeGroups[0]
      map.current.flyTo({ center: [g.lng, g.lat], zoom: 9, duration: 800 })
    } else {
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 })
    }
  }, [mapReady, activeGroups])

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.surface,
    color: colors.text,
    fontSize: 13,
    fontFamily: 'system-ui',
    outline: 'none',
    cursor: 'pointer',
  }

  if (!isAdmin(profile)) return null

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: 'Events Map' }} />

      {/* Controls bar */}
      <XStack
        padding="$3"
        gap="$3"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        backgroundColor={colors.surface}
        flexWrap="wrap"
      >
        <XStack gap="$2" alignItems="center">
          <Text color={colors.textMuted} fontSize="$2">
            From
          </Text>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              setDeselected(new Set())
            }}
            style={inputStyle}
          />
        </XStack>
        <XStack gap="$2" alignItems="center">
          <Text color={colors.textMuted} fontSize="$2">
            To
          </Text>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              setEndDate(e.target.value)
              setDeselected(new Set())
            }}
            style={inputStyle}
          />
        </XStack>
        <XStack flex={1} justifyContent="flex-end" alignItems="center" gap="$3">
          {activeGroups.length > 0 ? (
            <>
              <Text color={colors.textMuted} fontSize="$2">
                {activeGroups.length} location{activeGroups.length !== 1 ? 's' : ''} · {totalTrips}{' '}
                trip{totalTrips !== 1 ? 's' : ''}
              </Text>
              <XStack
                backgroundColor={colors.primary + '18'}
                borderRadius="$3"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color={colors.primary} fontWeight="700" fontSize="$3">
                  {totalMiles.toLocaleString()} mi total
                </Text>
              </XStack>
            </>
          ) : (
            <Text color={colors.textMuted} fontSize="$2">
              No events in range
            </Text>
          )}
        </XStack>
      </XStack>

      {/* Side panel + map */}
      <XStack flex={1}>
        {/* ── Side panel ── */}
        <YStack
          width={290}
          borderRightWidth={1}
          borderRightColor={colors.border}
          backgroundColor={colors.surface}
        >
          {/* Panel header */}
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderBottomWidth={1}
            borderBottomColor={colors.border}
            justifyContent="space-between"
            alignItems="center"
          >
            <Text color={colors.text} fontWeight="700" fontSize="$2">
              {allLocGroups.length} location{allLocGroups.length !== 1 ? 's' : ''}
            </Text>
            <Pressable onPress={toggleAll}>
              <Text color={colors.primary} fontSize="$2" fontWeight="600">
                {allSelected ? 'Deselect all' : 'Select all'}
              </Text>
            </Pressable>
          </XStack>

          {allLocGroups.length === 0 ? (
            <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
              <Text color={colors.textMuted} fontSize="$2" textAlign="center">
                No events with locations in this date range.
              </Text>
            </YStack>
          ) : (
            <ScrollView style={{ flex: 1 }}>
              {allLocGroups.map((group) => {
                const selected = !deselected.has(group.key)
                const roundTripTotal = Math.round(group.onewayMi * 2 * group.trips)
                return (
                  <Pressable key={group.key} onPress={() => toggleGroup(group.key)}>
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      gap="$2"
                      alignItems="flex-start"
                      borderBottomWidth={1}
                      borderBottomColor={colors.border}
                      opacity={selected ? 1 : 0.4}
                    >
                      {/* Checkbox */}
                      <XStack
                        width={18}
                        height={18}
                        borderRadius={4}
                        borderWidth={2}
                        borderColor={selected ? colors.primary : colors.border}
                        backgroundColor={selected ? colors.primary : 'transparent'}
                        alignItems="center"
                        justifyContent="center"
                        marginTop={2}
                        flexShrink={0}
                      >
                        {selected ? (
                          <Text color="white" fontSize={11} fontWeight="700">
                            ✓
                          </Text>
                        ) : null}
                      </XStack>

                      {/* Info */}
                      <YStack flex={1} gap="$0.5">
                        <Text color={colors.text} fontSize="$2" fontWeight="600" numberOfLines={2}>
                          {group.names.join(' / ')}
                        </Text>
                        <Text color={colors.textMuted} fontSize={11}>
                          {group.trips} trip{group.trips !== 1 ? 's' : ''} ·{' '}
                          {Math.round(group.onewayMi)} mi one-way
                        </Text>
                      </YStack>

                      {/* Round-trip total */}
                      <YStack alignItems="flex-end">
                        <Text
                          color={selected ? colors.primary : colors.textMuted}
                          fontSize={11}
                          fontWeight="600"
                        >
                          {roundTripTotal} mi
                        </Text>
                        <Text color={colors.textMuted} fontSize={10}>
                          round trip
                        </Text>
                      </YStack>
                    </XStack>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}

          {/* Panel footer — running total */}
          {allLocGroups.length > 0 ? (
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderTopWidth={1}
              borderTopColor={colors.border}
              justifyContent="space-between"
              alignItems="center"
            >
              <Text color={colors.textMuted} fontSize={11}>
                {activeGroups.length} of {allLocGroups.length} selected
              </Text>
              <Text color={colors.primary} fontWeight="700" fontSize="$2">
                {totalMiles.toLocaleString()} mi
              </Text>
            </XStack>
          ) : null}
        </YStack>

        {/* ── Map ── */}
        <View style={{ flex: 1, position: 'relative' }}>
          <div
            ref={mapContainer}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Legend */}
          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: 12,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              zIndex: 1,
              fontFamily: 'system-ui',
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: '#f56c5a',
                  borderRadius: '50% 50% 50% 0',
                  transform: 'rotate(-45deg)',
                  border: '2px solid white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: colors.text }}>Event location</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: '#2980b9',
                  borderRadius: '50%',
                  border: '2px solid white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: colors.text }}>North Liberty, IA</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 20, height: 2, background: '#5a7db5', flexShrink: 0 }} />
              <span style={{ color: colors.text }}>State border</span>
            </div>
          </div>
        </View>
      </XStack>
    </YStack>
  )
}
