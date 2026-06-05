import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
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

// North Liberty, IA — mission departure point
const HOME_LAT = 41.7491
const HOME_LNG = -91.5779

export default function EventsMapScreen() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const { templates, overrides, subscribe } = useEventsStore()

  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const [mapReady, setMapReady] = useState(false)
  const [totalMiles, setTotalMiles] = useState(0)
  const [tripCount, setTripCount] = useState(0)
  const [locCount, setLocCount] = useState(0)

  const defaultStart = () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  }
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

  // Subscribe to events (no-op if already subscribed by events screen)
  useEffect(() => {
    subscribe()
  }, [])

  // Redirect non-admins
  useEffect(() => {
    if (profile && !isAdmin(profile)) {
      router.replace('/(app)/events' as never)
    }
  }, [profile])

  // Inject Mapbox CSS from CDN
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

  // Initialize Mapbox map
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

    // Home marker (North Liberty)
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
      .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setHTML(
        '<div style="font-family:system-ui;font-size:12px;"><strong>North Liberty, IA</strong><br/>Mission departure point</div>'
      ))
      .addTo(map.current)

    map.current.on('load', () => {
      // Prominent US state border lines
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

  // Drop/update pins whenever date range or event data changes
  useEffect(() => {
    if (!mapReady || !map.current) return

    // Clear previous event markers (keep the home marker at index 0)
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    const instances = allInstances(templates, overrides, startDate, endDate)

    // Accumulate stats and deduplicate by rounded lat/lng
    const locMap = new Map<
      string,
      { lat: number; lng: number; names: Set<string>; trips: number; onewayMi: number }
    >()
    let totalMilesAcc = 0
    let tripCountAcc = 0

    for (const ev of instances) {
      const lat = ev._geocodeLat
      const lng = ev._geocodeLng
      if (!lat || !lng || ev.isVirtual) continue

      const oneway = haversineMiles(HOME_LAT, HOME_LNG, lat, lng)
      totalMilesAcc += oneway * 2
      tripCountAcc++

      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
      if (!locMap.has(key)) {
        locMap.set(key, { lat, lng, names: new Set(), trips: 0, onewayMi: oneway })
      }
      const loc = locMap.get(key)!
      loc.names.add(ev.title)
      loc.trips++
    }

    setTotalMiles(Math.round(totalMilesAcc))
    setTripCount(tripCountAcc)
    setLocCount(locMap.size)

    if (locMap.size === 0) {
      map.current.flyTo({ center: [HOME_LNG, HOME_LAT], zoom: 6.2, duration: 900 })
      return
    }

    // Build bounds that will contain all pins + home
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([HOME_LNG, HOME_LAT])

    for (const { lat, lng, names, trips, onewayMi } of locMap.values()) {
      // Teardrop pin element
      const el = document.createElement('div')
      el.title = Array.from(names).join(', ')
      el.style.cssText = [
        'width:26px',
        'height:26px',
        'background:#e8624a',
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

      const nameList = Array.from(names)
        .map((n) => `<strong>${n}</strong>`)
        .join('<br/>')
      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false, maxWidth: '240px' })
        .setHTML(`
          <div style="font-family:system-ui;padding:2px 4px;">
            ${nameList}
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

    // Zoom to fit all pins (auto-expands view if pins are outside current viewport)
    if (locMap.size === 1) {
      const only = Array.from(locMap.values())[0]
      map.current.flyTo({ center: [only.lng, only.lat], zoom: 9, duration: 900 })
    } else {
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 900 })
    }
  }, [mapReady, startDate, endDate, templates, overrides])

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
        {/* Date pickers */}
        <XStack gap="$2" alignItems="center">
          <Text color={colors.textMuted} fontSize="$2">
            From
          </Text>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
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
            onChange={(e) => setEndDate(e.target.value)}
            style={inputStyle}
          />
        </XStack>

        {/* Stats */}
        <XStack flex={1} justifyContent="flex-end" alignItems="center" gap="$3">
          {locCount > 0 ? (
            <>
              <Text color={colors.textMuted} fontSize="$2">
                {locCount} location{locCount !== 1 ? 's' : ''} · {tripCount} trip{tripCount !== 1 ? 's' : ''}
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

      {/* Map canvas */}
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
                background: '#e8624a',
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
            <div
              style={{
                width: 20,
                height: 2,
                background: '#5a7db5',
                flexShrink: 0,
              }}
            />
            <span style={{ color: colors.text }}>State border</span>
          </div>
        </div>
      </View>
    </YStack>
  )
}
