# Facebook Page sync — setup

Mirrors a Facebook Page's public posts into the Posts section of the portal.
New posts arrive within seconds via webhook, with an hourly backfill behind it.

Everything here is **read-only**. Nothing in this integration can post, edit, or
delete on Facebook, and no Page access token ever reaches a device.

## Why it works this way

Reading a Page's posts requires a Page access token, and only someone with full
control of the Page can grant one. So the owner grants it themselves, through a
web page served by Cloud Functions — they never need a portal account, and no
credential is ever handed over by email or chat.

Members can't like or comment from inside the app. Meta removed publishing on
behalf of a user (`publish_actions`) in Graph API v3.0 and never replaced it, and
a Page token would post *as the Page* rather than as the member who tapped. The
action buttons therefore deep-link to the real post on Facebook, where the member
is already signed in as themselves.

## One-time setup

### 1. Meta app

In the [Meta App Dashboard](https://developers.facebook.com/apps/):

1. Create an app of type **Business**, or reuse an existing one.
2. Add the **Facebook Login** product.
3. Under Facebook Login → Settings, add this to **Valid OAuth Redirect URIs**:
   ```
   https://<region>-<project>.cloudfunctions.net/fbConnect
   ```
4. **App Roles → Roles → Add People → Tester**: invite each Page owner's personal
   Facebook account.

That last step is what keeps you out of App Review. Permissions that normally
need review work without it while the app is in Development mode, for any user
holding a role on the app — and the exemption keys off *the person granting the
permission*, not off you. An owner who isn't a Tester would require App Review
for `pages_show_list` + `pages_read_engagement`.

Keep the app in **Development** mode. Going Live is what triggers the review
requirement; nothing here needs it.

### 2. Secrets

```bash
firebase functions:secrets:set FB_APP_ID              # Meta app ID
firebase functions:secrets:set FB_APP_SECRET          # Meta app secret
firebase functions:secrets:set FB_WEBHOOK_VERIFY_TOKEN # any random string you choose
firebase functions:secrets:set FB_CONNECT_SECRET      # any long random string
```

`FB_WEBHOOK_VERIFY_TOKEN` and `FB_CONNECT_SECRET` are ours, not Meta's — generate
them with `openssl rand -hex 32`. The verify token is echoed back to Meta during
webhook registration; the connect secret signs invitation links.

Set the public base URL as a plain parameter (not a secret):

```bash
firebase functions:config:set   # not used — this is a v2 param, set at deploy:
FB_CONNECT_BASE_URL=https://<region>-<project>.cloudfunctions.net firebase deploy --only functions
```

Or add it to `functions/.env`:

```
FB_CONNECT_BASE_URL=https://us-central1-mission-team-portal.cloudfunctions.net
```

### 3. Deploy

```bash
firebase deploy --only functions,firestore:rules
```

### 4. Webhook

Back in the Meta App Dashboard → **Webhooks** → **Page**:

- **Callback URL**: `https://<region>-<project>.cloudfunctions.net/fbWebhook`
- **Verify Token**: the `FB_WEBHOOK_VERIFY_TOKEN` value
- Subscribe to the **`feed`** field.

Meta calls the URL once to verify. It must be deployed before you save this.

## Connecting a Page

1. In the portal: **Posts → ⚙ Build → (page) → Create connection link**. The link
   is copied to your clipboard. It works once and expires in 14 days.
2. Send it to the Page owner along with `docs/`-adjacent handout instructions.
3. They open it, click through to Facebook, pick their Page, and are done.
4. Back in **⚙ Build**, select the now-connected Page under **Show posts from**
   and save.

Posts appear immediately — the first sync runs inline as the owner finishes.

## What runs

| Function | Trigger | Does |
|---|---|---|
| `fbConnect` | HTTPS | The owner-facing OAuth flow, all stages on one URL |
| `fbWebhook` | HTTPS | Meta's real-time `feed` events; verifies `X-Hub-Signature-256` |
| `fbPostsBackfill` | Hourly (`:17`) | Re-syncs every connected Page, refreshes counts, removes deletions |
| `createFbConnectLink` | Callable (admin) | Mints a signed invitation link |
| `listFbConnections` | Callable (admin) | Connection health — never returns tokens |
| `syncFbPageNow` | Callable (admin) | Manual sync |
| `disconnectFbPage` | Callable (admin) | Unsubscribes the webhook and deletes synced posts |

## Data

| Path | Access |
|---|---|
| `fbPagePosts/{pageId}/posts/{postId}` | Signed-in read; no client writes |
| `fbConnections/{pageId}` | No client access at all — holds the Page token |
| `fbConnectInvites/{inviteId}` | No client access at all |

Post images are copied into Cloud Storage under `fbPagePosts/{pageId}/` on first
sync. Graph's `full_picture` URLs are signed and expire after a few weeks, so
storing them verbatim would make posts silently lose their images.

## When it breaks

A Page access token minted from a long-lived user token does not expire on a
timer, but it dies if the owner changes their password, removes the app under
Business Integrations, or loses their Page role.

Sync then fails silently. The failure surfaces in two places: `status: 'error'`
and `lastSyncError` on the connection document, and a red warning on the
connection card in **⚙ Build**. Recovery is a fresh connection link to the owner.

There is no push notification on sync failure — adding one means extending
`NotificationType` and its templates. Worth doing if these Pages become
load-bearing; until then, `logger.error('fb: sync failed')` in Cloud Logging is
the hook to alert on.

## Known limits

- **Engagement counts are a snapshot.** The webhook fires on new posts and
  comments, but a like landing on an old post pushes no event. Counts refresh
  hourly, so the portal can briefly disagree with Facebook.
- **Rich media renders thin.** Live videos and Reels come back from Graph with
  little more than a thumbnail. They show as an image plus a tap-through rather
  than an in-app player.
- **Only the Page's own posts.** Visitor posts on the Page are not synced.
