import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

// Customises the HTML shell for the SPA web export.
// React silently drops `style` props on <html>/<body> during SSG, so we use
// a <style> tag (like ScrollViewStyleReset does) to force the dark background
// before JavaScript loads. The !important ensures Tamagui's runtime-injected
// @media(prefers-color-scheme) body{background:...} rule cannot override it.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body,#root{background-color:#1a1a2e!important}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
