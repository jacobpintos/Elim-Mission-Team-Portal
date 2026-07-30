/**
 * Read a local `file://` (or `content://`) URI into a Blob.
 *
 * React Native's Blob cannot be constructed from an ArrayBuffer or a typed
 * array — `new Blob([uint8Array])` throws "Creating blobs from 'ArrayBuffer'
 * and 'ArrayBufferView' are not supported". That rules out Firebase Storage's
 * `uploadString`, which base64-decodes into a Uint8Array and hands it to the
 * Blob constructor. The only Blobs React Native can produce are the ones its
 * networking layer creates, so anything destined for `uploadBytes` has to come
 * back through a request.
 *
 * Uses XMLHttpRequest rather than `fetch(uri).blob()`: fetch surfaces a
 * failure to read the file as an opaque "Network request failed", while the
 * XHR path lets us report something the caller can act on.
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('Could not read the selected file'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
}
