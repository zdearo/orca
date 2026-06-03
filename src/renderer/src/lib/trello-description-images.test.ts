import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareTrelloDescriptionForSave } from './trello-description-images'
import { trelloUploadAttachment } from '@/runtime/runtime-trello-client'

vi.mock('@/runtime/runtime-trello-client', () => ({
  trelloUploadAttachment: vi.fn()
}))

const mockedUploadAttachment = vi.mocked(trelloUploadAttachment)

describe('prepareTrelloDescriptionForSave', () => {
  beforeEach(() => {
    mockedUploadAttachment.mockReset()
  })

  it('uploads data URL images as Trello attachments before saving desc', async () => {
    mockedUploadAttachment.mockResolvedValueOnce({
      ok: true,
      attachment: {
        id: 'att-1',
        name: 'Screenshot-1.png',
        fileName: 'Screenshot-1.png',
        mimeType: 'image/png',
        url: 'https://trello.com/1/cards/card-1/attachments/att-1/download/Screenshot-1.png'
      }
    })
    const settings = { activeRuntimeEnvironmentId: null }

    await expect(
      prepareTrelloDescriptionForSave({
        cardId: 'card-1',
        description: 'Look\n\n![Screenshot](data:image/png;base64,iVBORw==)',
        settings: settings as never
      })
    ).resolves.toBe(
      'Look\n\n![Screenshot](https://trello.com/1/cards/card-1/attachments/att-1/download/Screenshot-1.png)'
    )

    expect(mockedUploadAttachment).toHaveBeenCalledWith(settings, {
      cardId: 'card-1',
      name: 'Screenshot-1.png',
      mimeType: 'image/png',
      contentBase64: 'iVBORw=='
    })
  })

  it('rejects blob images instead of sending invalid desc to Trello', async () => {
    await expect(
      prepareTrelloDescriptionForSave({
        cardId: 'card-1',
        description: '![image](blob:local-image)',
        settings: undefined
      })
    ).rejects.toThrow('unsaved blob image')

    expect(mockedUploadAttachment).not.toHaveBeenCalled()
  })
})
