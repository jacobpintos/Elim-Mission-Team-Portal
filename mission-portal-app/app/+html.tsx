import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

// This file is only rendered on the server for the web build.
// Sets the baseline HTML/body styles so that:
//   1. html/body/root are 100% height → flex:1 children fill the viewport
//   2. body has the dark-theme background from the start → no flash of wrong bg
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
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #1a1a2e;
              }
            `,
          }}
        />
      </head>
      <body style={{ height: '100%' }}>{children}</body>
    </html>
  )
}
