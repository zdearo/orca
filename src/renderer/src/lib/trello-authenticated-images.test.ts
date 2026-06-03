import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrelloImageSrcResolver } from './trello-authenticated-images'
import { trelloDownloadImage } from '@/runtime/runtime-trello-client'

vi.mock('@/runtime/runtime-trello-client', () => ({
  trelloDownloadImage: vi.fn()
}))

const mockedDownloadImage = vi.mocked(trelloDownloadImage)

describe('Trello authenticated image resolver', () => {
  beforeEach(() => {
    mockedDownloadImage.mockReset()
  })

  it('leaves non-Trello image URLs to the default renderer path', async () => {
    const resolver = createTrelloImageSrcResolver(undefined)

    await expect(resolver('https://example.com/image.png')).resolves.toBeUndefined()

    expect(mockedDownloadImage).not.toHaveBeenCalled()
  })

  it('downloads authenticated Trello card images through runtime and returns a blob URL', async () => {
    const blobUrl = 'blob:trello-image'
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce(blobUrl)
    mockedDownloadImage.mockResolvedValueOnce({
      ok: true,
      contentType: 'image/png',
      contentBase64: 'iVBORw=='
    })
    const settings = { activeRuntimeEnvironmentId: null }
    const resolver = createTrelloImageSrcResolver(settings as never)
    const src = 'https://trello.com/1/cards/card-1/attachments/a-1/download/image.png'

    await expect(resolver(src)).resolves.toBe(blobUrl)

    expect(mockedDownloadImage).toHaveBeenCalledWith(settings, src)
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    createObjectURL.mockRestore()
  })

  it('proxies API-hosted Trello card image URLs', async () => {
    const blobUrl = 'blob:trello-api-image'
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce(blobUrl)
    mockedDownloadImage.mockResolvedValueOnce({
      ok: true,
      contentType: 'image/jpeg',
      contentBase64: '/9j/'
    })
    const resolver = createTrelloImageSrcResolver(undefined)
    const src = 'https://api.trello.com/1/cards/card-1/attachments/a-1/download/image.jpg'

    await expect(resolver(src)).resolves.toBe(blobUrl)

    expect(mockedDownloadImage).toHaveBeenCalledWith(undefined, src)
    createObjectURL.mockRestore()
  })

  it('blocks direct browser loading when authenticated download fails', async () => {
    mockedDownloadImage.mockResolvedValueOnce({ ok: false, error: 'Not connected' })
    const resolver = createTrelloImageSrcResolver(undefined)

    await expect(
      resolver('https://trello.com/1/cards/card-2/attachments/a-2/download/image.png')
    ).resolves.toBeNull()
  })
})
