import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trelloDownload } from './client'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn(() => 'token-1')
  }
}))

vi.mock('./credentials', () => ({
  deleteTrelloCredentials: vi.fn(),
  getTrelloCredentialsMetadata: vi.fn(() => ({
    apiKey: 'key-1',
    viewer: { id: 'me', username: 'me', displayName: 'Me' },
    hasToken: true
  })),
  loadTrelloToken: vi.fn(() => 'token-1'),
  saveTrelloCredentials: vi.fn(),
  updateTrelloViewer: vi.fn()
}))

describe('Trello client downloads', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/attachments/a-1')) {
          return Response.json({
            id: 'a-1',
            url: 'https://trello.com/1/cards/card-1/attachments/a-1/download/image.png',
            mimeType: 'image/png',
            fileName: 'image.png'
          })
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      })
    )
  })

  it('authenticates api.trello.com attachment downloads with Trello OAuth header', async () => {
    const result = await trelloDownload(
      'https://api.trello.com/1/cards/card-1/attachments/a-1/download/image.png'
    )

    expect(result.contentType).toBe('image/png')
    expect(result.contentBase64).toBe('AQID')
    const metadataUrl = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string)
    expect(metadataUrl.pathname).toBe('/1/cards/card-1/attachments/a-1')
    expect(metadataUrl.searchParams.get('key')).toBe('key-1')
    expect(metadataUrl.searchParams.get('token')).toBe('token-1')

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[1]?.[0] as string)
    expect(requestedUrl.hostname).toBe('trello.com')
    expect(requestedUrl.searchParams.get('key')).toBeNull()
    expect(requestedUrl.searchParams.get('token')).toBeNull()
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      headers: {
        Authorization: 'OAuth oauth_consumer_key="key-1", oauth_token="token-1"'
      }
    })
  })

  it('downloads the attachment URL returned by Trello metadata', async () => {
    await trelloDownload('https://trello.com/1/cards/card-1/attachments/a-1/download/stale.png')

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[1]?.[0] as string)
    expect(requestedUrl.pathname).toBe('/1/cards/card-1/attachments/a-1/download/image.png')
  })

  it('rejects non-Trello download hosts', async () => {
    await expect(
      trelloDownload('https://example.com/1/cards/card-1/download/image.png')
    ).rejects.toThrow('Unsupported Trello image URL.')
  })
})
