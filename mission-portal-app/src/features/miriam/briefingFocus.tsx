import { createContext, useContext, useRef, type ReactNode } from 'react'
import { View, type View as ViewType } from 'react-native'

/**
 * Which rows of the briefing Miriam is saying now, and where each is on the
 * screen — so the briefing screen (./BriefingScreen) can light them up and
 * scroll them into view as she reaches them. Outside that screen there is
 * nothing to light up, and rows draw as they always have.
 */
interface FocusState {
  active: ReadonlySet<string>
  accent: string
  /** Where a row is within what scrolls, measured from its top. */
  place: (id: string, y: number, height: number) => void
  content: { current: ViewType | null }
}

const FocusContext = createContext<FocusState | null>(null)

export const BriefingFocusProvider = FocusContext.Provider
export type { FocusState as BriefingFocusState }

/** A row of the briefing, lit up while she is saying it. */
export function Focus({ id, children }: { id: string; children: ReactNode }) {
  const focus = useContext(FocusContext)
  const self = useRef<ViewType | null>(null)
  if (!focus) return <>{children}</>
  const on = focus.active.has(id)
  const measure = () => {
    const node = self.current
    const within = focus.content.current
    if (!node || !within) return
    try {
      node.measureLayout(
        within as never,
        (_x: number, y: number, _w: number, h: number) => focus.place(id, y, h),
        () => {}
      )
    } catch {
      // Not laid out yet; measured again when it is.
    }
  }
  return (
    <View
      ref={self}
      onLayout={measure}
      style={{
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: on ? focus.accent : 'transparent',
        backgroundColor: on ? `${focus.accent}22` : 'transparent',
        paddingLeft: 4,
      }}
      accessibilityState={{ selected: on }}
    >
      {children}
    </View>
  )
}
