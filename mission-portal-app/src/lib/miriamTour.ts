/**
 * A tour asked of Miriam — "give me a tour", "walk me through Worship",
 * "show me how Events works" — found on the device, so the app's own tour
 * starts at once without anything being sent off to be worked out.
 *
 * `part`: the part of the app asked about, as said ("worship", "the events
 * tab"), or "" for the whole app. Null when it isn't asking for a tour:
 * "how do I…" questions are answered, not toured.
 */
export function tourAsked(text: string): { part: string } | null {
  const said = text
    .toLowerCase()
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Asking words either side: "can you", "please", "now".
    .replace(
      /^(?:(?:hey|ok|okay)\s+)?(?:miriam\s+)?(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+)?/,
      ''
    )
    .replace(/\s+(?:please|now|again)$/, '')
  const forms: RegExp[] = [
    // "give me a tour", "start the tour of events", "tour of worship", "a quick tour"
    /^(?:(?:give|show|take)\s+(?:me|us)\s+|start\s+|run\s+|do\s+|i\s+(?:want|would like|need)\s+|can\s+i\s+(?:have|get)\s+)?(?:a\s+|the\s+)?(?:quick\s+|guided\s+|full\s+)?tour(?:\s+(?:of|for|through|on)\s+(.*))?$/,
    // "walk me through worship", "walk me through the app"
    /^walk\s+(?:me|us)\s+through\s+(.*)$/,
    // "show me around", "show me around the events tab"
    /^show\s+(?:me|us)\s+around(?:\s+(.*))?$/,
    // "show me how events works", "show me how the worship tab works"
    /^show\s+(?:me|us)\s+how\s+(.*?)\s+works?$/,
  ]
  for (const form of forms) {
    const m = said.match(form)
    if (!m) continue
    const part = (m[1] ?? '')
      .replace(/^the\s+/, '')
      .replace(/\s+(?:tab|page|screen|section|part)$/, '')
      .replace(/^(?:the\s+)?(?:app|whole app|everything|mission portal|portal)$/, '')
      .trim()
    return { part }
  }
  return null
}
