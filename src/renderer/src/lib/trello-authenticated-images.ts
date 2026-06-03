import type { GlobalSettings } from '../../../shared/types'
import type { RichMarkdownImageSrcResolver } from '@/components/editor/rich-markdown-extensions'
import { trelloDownloadImage } from '@/runtime/runtime-trello-client'

const TRELLO_IMAGE_CACHE_MAX_SIZE = 100
const trelloImageBlobCache = new Map<string, string>()

function isTrelloDownloadHost(hostname: string): boolean {
  return hostname === 'trello.com' || hostname === 'api.trello.com'
}

function isTrelloAuthenticatedDownload(src: string): boolean {
  try {
    const url = new URL(src)
    return (
      url.protocol === 'https:' &&
      isTrelloDownloadHost(url.hostname) &&
      url.pathname.startsWith('/1/cards/') &&
      url.pathname.includes('/download/')
    )
  } catch {
    return false
  }
}

function cacheTrelloBlobUrl(key: string, url: string): void {
  const previous = trelloImageBlobCache.get(key)
  if (previous) {
    trelloImageBlobCache.delete(key)
    if (previous !== url) {
      URL.revokeObjectURL(previous)
    }
  }
  trelloImageBlobCache.set(key, url)
  if (trelloImageBlobCache.size > TRELLO_IMAGE_CACHE_MAX_SIZE) {
    const oldest = trelloImageBlobCache.keys().next().value
    if (oldest !== undefined) {
      const oldUrl = trelloImageBlobCache.get(oldest)
      trelloImageBlobCache.delete(oldest)
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl)
      }
    }
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

export function createTrelloImageSrcResolver(
  settings: GlobalSettings | null | undefined
): RichMarkdownImageSrcResolver {
  return async (src) => {
    if (!isTrelloAuthenticatedDownload(src)) {
      return undefined
    }

    const cached = trelloImageBlobCache.get(src)
    if (cached) {
      return cached
    }

    const result = await trelloDownloadImage(settings, src)
    console.debug('[trello] Resolving authenticated image through app proxy:', src)
    if (!result.ok) {
      console.warn('[trello] Authenticated image proxy failed:', result.error)
      return null
    }

    // Why: Trello auth stays in main/runtime; the editor only receives an opaque
    // Blob URL, so key/token never enter markdown, DOM attributes, or logs.
    const blobUrl = URL.createObjectURL(
      new Blob([base64ToArrayBuffer(result.contentBase64)], { type: result.contentType })
    )
    cacheTrelloBlobUrl(src, blobUrl)
    return blobUrl
  }
}
