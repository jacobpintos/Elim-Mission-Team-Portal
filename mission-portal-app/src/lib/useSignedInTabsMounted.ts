import { useEffect, useState } from 'react'
import { useNavigationContainerRef } from 'expo-router'
import { signedInTabsMounted, type NavState } from './tabsMounted'

/** signedInTabsMounted, kept up to date as the navigation state changes. */
export function useSignedInTabsMounted(): boolean {
  const nav = useNavigationContainerRef()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const check = () =>
      setMounted(signedInTabsMounted(nav.isReady() ? (nav.getRootState() as NavState) : undefined))
    check()
    return nav.addListener('state', check)
  }, [nav])
  return mounted
}
