import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { TRELLO_METHODS } from './trello'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('trello RPC methods', () => {
  it('routes account, property metadata, card, comment, and image methods', async () => {
    const runtime = {
      getRuntimeId: vi.fn(() => 'runtime-1'),
      trelloConnect: vi.fn(),
      trelloDisconnect: vi.fn(),
      trelloStatus: vi.fn(),
      trelloTestConnection: vi.fn(),
      trelloListBoards: vi.fn(),
      trelloListLists: vi.fn(),
      trelloListBoardMembers: vi.fn(),
      trelloListBoardLabels: vi.fn(),
      trelloListCards: vi.fn(),
      trelloSearchCards: vi.fn(),
      trelloGetCard: vi.fn(),
      trelloCreateCard: vi.fn(),
      trelloUpdateCard: vi.fn(),
      trelloAddCardComment: vi.fn(),
      trelloCardComments: vi.fn(),
      trelloDownloadImage: vi.fn()
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: TRELLO_METHODS })

    await dispatcher.dispatch(makeRequest('trello.status'))
    await dispatcher.dispatch(makeRequest('trello.testConnection'))
    await dispatcher.dispatch(makeRequest('trello.connect', { apiKey: ' key ', token: ' token ' }))
    await dispatcher.dispatch(makeRequest('trello.disconnect'))
    await dispatcher.dispatch(makeRequest('trello.listBoards'))
    await dispatcher.dispatch(makeRequest('trello.listLists', { boardId: ' board-1 ' }))
    await dispatcher.dispatch(makeRequest('trello.listBoardMembers', { boardId: ' board-1 ' }))
    await dispatcher.dispatch(makeRequest('trello.listBoardLabels', { boardId: ' board-1 ' }))
    await dispatcher.dispatch(
      makeRequest('trello.listCards', {
        filter: 'allOpen',
        limit: 50,
        boardIds: ['board-1']
      })
    )
    await dispatcher.dispatch(
      makeRequest('trello.searchCards', {
        query: ' card ',
        limit: 25,
        boardIds: ['board-1']
      })
    )
    await dispatcher.dispatch(makeRequest('trello.getCard', { cardId: ' card-1 ' }))
    await dispatcher.dispatch(
      makeRequest('trello.createCard', {
        idBoard: ' board-1 ',
        idList: ' list-1 ',
        name: ' New card ',
        desc: ' Description '
      })
    )
    await dispatcher.dispatch(
      makeRequest('trello.updateCard', {
        cardId: ' card-1 ',
        updates: { idList: 'list-2', idMembers: ['m-1'], idLabels: ['l-1'] }
      })
    )
    await dispatcher.dispatch(
      makeRequest('trello.addCardComment', { cardId: ' card-1 ', text: ' Looks good ' })
    )
    await dispatcher.dispatch(makeRequest('trello.cardComments', { cardId: ' card-1 ' }))
    await dispatcher.dispatch(
      makeRequest('trello.downloadImage', {
        url: ' https://trello.com/1/cards/card-1/attachments/a-1/download/image.png '
      })
    )

    expect(runtime.trelloStatus).toHaveBeenCalled()
    expect(runtime.trelloTestConnection).toHaveBeenCalled()
    expect(runtime.trelloConnect).toHaveBeenCalledWith({ apiKey: 'key', token: 'token' })
    expect(runtime.trelloDisconnect).toHaveBeenCalled()
    expect(runtime.trelloListBoards).toHaveBeenCalled()
    expect(runtime.trelloListLists).toHaveBeenCalledWith('board-1')
    expect(runtime.trelloListBoardMembers).toHaveBeenCalledWith('board-1')
    expect(runtime.trelloListBoardLabels).toHaveBeenCalledWith('board-1')
    expect(runtime.trelloListCards).toHaveBeenCalledWith('allOpen', 50, ['board-1'])
    expect(runtime.trelloSearchCards).toHaveBeenCalledWith(' card ', 25, ['board-1'])
    expect(runtime.trelloGetCard).toHaveBeenCalledWith('card-1')
    expect(runtime.trelloCreateCard).toHaveBeenCalledWith({
      idBoard: 'board-1',
      idList: 'list-1',
      name: 'New card',
      desc: 'Description'
    })
    expect(runtime.trelloUpdateCard).toHaveBeenCalledWith('card-1', {
      idList: 'list-2',
      idMembers: ['m-1'],
      idLabels: ['l-1']
    })
    expect(runtime.trelloAddCardComment).toHaveBeenCalledWith('card-1', 'Looks good')
    expect(runtime.trelloCardComments).toHaveBeenCalledWith('card-1')
    expect(runtime.trelloDownloadImage).toHaveBeenCalledWith(
      'https://trello.com/1/cards/card-1/attachments/a-1/download/image.png'
    )
  })
})
