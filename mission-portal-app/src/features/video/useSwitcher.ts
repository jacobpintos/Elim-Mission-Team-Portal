import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { AtemConnection, cloneAtemState, type AtemState } from '@/lib/switcher/atem'
import { switcherAccess } from '@/features/miriam/equipmentAccess'

export type SwitcherStatus =
  | 'connecting'
  | 'connected'
  /** Nothing answered at the saved address. */
  | 'unreachable'
  | 'not operator'
  /** The website, or an app build without the native module. */
  | 'no app'
  | 'no address'

/** How long after losing the switcher to try again. */
const RETRY_MS = 1500

/**
 * The video switcher, connected while this screen is open and the app is in
 * front (lib/switcher/atem: AtemConnection): its inputs, and what's live and
 * on preview as it changes, from the panel too. Let go on leaving the screen
 * or the app; connected again when the switcher is lost.
 */
export function useSwitcher(uid: string) {
  const [status, setStatus] = useState<SwitcherStatus>('connecting')
  const [state, setState] = useState<AtemState | null>(null)
  const conn = useRef<AtemConnection | null>(null)
  /** On screen, with the app in front. */
  const wanted = useRef(false)
  /** Each start counts; a stale one gives up. */
  const generation = useRef(0)
  /** `start`, for trying again once the switcher is lost. */
  const again = useRef<() => void>(() => {})

  const stop = useCallback(() => {
    generation.current++
    conn.current?.close()
    conn.current = null
  }, [])

  const start = useCallback(async () => {
    stop()
    const gen = generation.current
    const current = () => gen === generation.current
    setStatus('connecting')
    const access = await switcherAccess(uid)
    if (!current()) return
    if (access.kind !== 'ready') {
      setStatus(access.kind)
      return
    }
    const c = new AtemConnection(access.open)
    conn.current = c
    c.onChange = (s) => {
      if (current()) setState(cloneAtemState(s))
    }
    const ok = await c.connect()
    if (!current()) {
      c.close()
      return
    }
    if (!ok) {
      conn.current = null
      setStatus('unreachable')
      return
    }
    setState(cloneAtemState(c.state))
    setStatus('connected')
    const how = await c.listen()
    if (!current()) return
    conn.current = null
    if (how === 'lost' && wanted.current) {
      setStatus('connecting')
      setTimeout(() => {
        if (wanted.current && current()) again.current()
      }, RETRY_MS)
    }
  }, [uid, stop])
  useEffect(() => {
    again.current = () => void start()
  }, [start])

  useFocusEffect(
    useCallback(() => {
      wanted.current = true
      void start()
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          wanted.current = true
          if (!conn.current) void start()
        } else if (s === 'background') {
          wanted.current = false
          stop()
        }
      })
      return () => {
        wanted.current = false
        sub.remove()
        stop()
      }
    }, [start, stop])
  )

  /** Sends commands: true once the switcher has them. */
  const command = useCallback(
    (commands: Uint8Array[]) => conn.current?.command(commands) ?? Promise.resolve(false),
    []
  )

  return { status, state, command, retry: start }
}
