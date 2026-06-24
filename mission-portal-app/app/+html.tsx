export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover lets env(safe-area-inset-bottom) return the real value
            on iOS Safari so the FAB clears the home indicator / navigation bar. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <style>{`
          html, body { height: 100%; overflow: hidden; }
          body { display: flex; flex-direction: column; }
          #root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        `}</style>
      </head>
      <body style={{ height: '100%' }}>{children}</body>
    </html>
  )
}
