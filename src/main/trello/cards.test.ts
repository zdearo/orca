import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBoardLabels, listBoardMembers, updateCard, uploadCardAttachment } from './cards'
import { trelloRequest } from './client'

vi.mock('./client', () => ({
  acquire: vi.fn(async () => undefined),
  release: vi.fn(),
  trelloRequest: vi.fn()
}))

const mockedTrelloRequest = vi.mocked(trelloRequest)

describe('Trello cards API', () => {
  beforeEach(() => {
    mockedTrelloRequest.mockReset()
  })

  it('maps board members and labels for inline card properties', async () => {
    mockedTrelloRequest
      .mockResolvedValueOnce([
        {
          id: 'm-1',
          username: 'ada',
          fullName: 'Ada Lovelace',
          avatarUrl: 'https://a.trello.test/avatar'
        }
      ])
      .mockResolvedValueOnce([{ id: 'l-1', name: 'Bug', color: 'red' }])

    await expect(listBoardMembers('board-1')).resolves.toEqual([
      {
        id: 'm-1',
        username: 'ada',
        fullName: 'Ada Lovelace',
        avatarUrl: 'https://a.trello.test/avatar/50.png'
      }
    ])
    await expect(listBoardLabels('board-1')).resolves.toEqual([
      { id: 'l-1', name: 'Bug', color: 'red' }
    ])

    expect(mockedTrelloRequest).toHaveBeenNthCalledWith(
      1,
      '/boards/board-1/members?fields=username,fullName,avatarUrl'
    )
    expect(mockedTrelloRequest).toHaveBeenNthCalledWith(
      2,
      '/boards/board-1/labels?fields=name,color'
    )
  })

  it('serializes member and label updates without leaking credentials', async () => {
    mockedTrelloRequest.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Card',
      desc: '',
      idBoard: 'board-1',
      idList: 'list-1',
      labels: [],
      members: []
    })

    await updateCard('card-1', {
      idMembers: ['m-1', 'm-2'],
      idLabels: ['l-1']
    })

    expect(mockedTrelloRequest).toHaveBeenCalledWith('/cards/card-1', {
      method: 'PUT',
      body: JSON.stringify({ idMembers: 'm-1,m-2', idLabels: 'l-1' })
    })
  })

  it('uploads pasted data images as Trello card attachments', async () => {
    mockedTrelloRequest.mockResolvedValueOnce({
      id: 'att-1',
      name: 'image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      url: 'https://trello.com/1/cards/card-1/attachments/att-1/download/image.png'
    })

    await expect(
      uploadCardAttachment({
        cardId: 'card-1',
        name: 'image.png',
        mimeType: 'image/png',
        contentBase64: 'AQID'
      })
    ).resolves.toEqual({
      id: 'att-1',
      name: 'image.png',
      fileName: 'image.png',
      mimeType: 'image/png',
      url: 'https://trello.com/1/cards/card-1/attachments/att-1/download/image.png'
    })

    expect(mockedTrelloRequest).toHaveBeenCalledWith('/cards/card-1/attachments', {
      method: 'POST',
      body: expect.any(FormData)
    })
  })
})
