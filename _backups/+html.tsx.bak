import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

// Customises the HTML shell for the SPA web export.
// Inline styles on <html>/<body> beat any external stylesheet.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
      </head>
      <body
        style={{
          height: '100%',
          margin: 0,
          padding: 0,
          // Default dark palette background so there's no flash of white/gray
          // before JS loads and DynamicThemeProvider injects the real colour.
          backgroundColor: '#1a1a2e',
        }}
      >
        {children}
      </body>
    </html>
  )
}

