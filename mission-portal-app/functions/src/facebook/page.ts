/**
 * The HTML the Page owner sees.
 *
 * These pages are the whole experience for someone who does not use the
 * portal and may never have met us — the tone is plain, the next step is
 * always explicit, and errors say what to do rather than what went wrong
 * internally. Styles are inline because there is nowhere to host a
 * stylesheet from a Cloud Function.
 */

const SHELL_STYLE = `
  :root {
    color-scheme: light dark;
    --ground: #f4f6f5;
    --surface: #ffffff;
    --ink: #16211f;
    --ink-soft: #4a5a58;
    --rule: #d9dfde;
    --accent: #0d5f5c;
    --accent-ink: #ffffff;
    --stop: #9b3030;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #101817;
      --surface: #17211f;
      --ink: #e8eeec;
      --ink-soft: #a8b8b5;
      --rule: #2a3634;
      --accent: #5cc0b6;
      --accent-ink: #08211f;
      --stop: #e58a80;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 48px 20px 80px;
    background: var(--ground);
    color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 17px;
    line-height: 1.6;
  }
  .card {
    max-width: 560px;
    margin: 0 auto;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 14px;
    padding: 36px 32px;
  }
  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 400;
    font-size: 30px;
    line-height: 1.2;
    margin: 0 0 16px;
  }
  p { margin: 0 0 16px; color: var(--ink-soft); }
  p.lead { color: var(--ink); }
  .mark { font-size: 40px; line-height: 1; margin-bottom: 20px; }
  .btn {
    display: block;
    width: 100%;
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    border-radius: 9px;
    padding: 15px 20px;
    font-size: 17px;
    font-weight: 700;
    font-family: inherit;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    margin-top: 8px;
  }
  .btn:hover { opacity: .92; }
  .btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  .pages { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .pages button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--surface);
    border: 2px solid var(--rule);
    border-radius: 11px;
    padding: 14px 16px;
    font: inherit;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .pages button:hover { border-color: var(--accent); }
  .pages button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .pages img { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; background: var(--rule); }
  .pages strong { font-size: 16px; }
  .fineprint {
    margin: 28px 0 0;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
    font-size: 14px;
    color: var(--ink-soft);
  }
  .bad { color: var(--stop); font-weight: 600; }
`

export function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${SHELL_STYLE}</style></head>
<body><main class="card">${body}</main></body></html>`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function startPage(orgName: string, authUrl: string): string {
  return htmlShell(
    'Connect your Facebook Page',
    `<h1>Connect your Facebook Page</h1>
     <p class="lead">This lets ${escapeHtml(orgName)} show your Page's public posts inside our
       team app. It takes about a minute.</p>
     <p>You'll be sent to Facebook to sign in and choose your Page. We never see your password.</p>
     <p><strong>This is read-only.</strong> We can read posts you've already made public. We cannot
       post as your Page, read your messages, or see your personal profile.</p>
     <a class="btn" href="${escapeHtml(authUrl)}">Continue to Facebook</a>
     <p class="fineprint">You can disconnect at any time from Facebook under
       Settings &amp; Privacy → Settings → Business Integrations.</p>`
  )
}

export function pickerPage(
  pages: { id: string; name: string; picture?: string }[],
  chooseUrl: (pageId: string) => string
): string {
  const items = pages
    .map(
      (p) => `<li><form method="GET" action="${escapeHtml(chooseUrl(p.id))}">
        <button type="submit">
          ${p.picture ? `<img src="${escapeHtml(p.picture)}" alt="">` : '<img alt="">'}
          <strong>${escapeHtml(p.name)}</strong>
        </button></form></li>`
    )
    .join('')
  return htmlShell(
    'Choose your Page',
    `<h1>Which Page should we connect?</h1>
     <p>You manage more than one. Pick the Page whose posts should appear in the team app.</p>
     <ul class="pages">${items}</ul>
     <p class="fineprint">Only the Page you choose here is connected. The others are untouched.</p>`
  )
}

export function successPage(pageName: string): string {
  return htmlShell(
    'Connected',
    `<div class="mark">✅</div>
     <h1>${escapeHtml(pageName)} is connected</h1>
     <p class="lead">That's everything — you don't need to do anything else, and you won't need to
       repeat this.</p>
     <p>Your public posts will start appearing in the team app within a few minutes. New posts will
       show up automatically from now on.</p>
     <p>You can close this window.</p>
     <p class="fineprint">Changed your mind? Disconnect any time on Facebook under
       Settings &amp; Privacy → Settings → Business Integrations. You don't need to ask us first.</p>`
  )
}

export function errorPage(headline: string, guidance: string): string {
  return htmlShell(
    'Something went wrong',
    `<div class="mark">⚠️</div>
     <h1>${escapeHtml(headline)}</h1>
     <p class="lead">${escapeHtml(guidance)}</p>
     <p class="fineprint">If this keeps happening, send whoever gave you this link a screenshot of
       this page — it tells them exactly where it stopped.</p>`
  )
}
