import { z } from 'zod'
import type { RpcMethod } from '../core'
import { defineMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredString
} from '../schemas'

const VALID_FILTERS = ['assigned', 'allOpen', 'archived'] as const

const Connect = z.object({
  apiKey: requiredString('API key is required'),
  token: requiredString('Token is required')
})

const BoardId = z.object({
  boardId: requiredString('Board ID is required')
})

const CardId = z.object({
  cardId: requiredString('Card ID is required')
})

const ListCards = z
  .object({
    filter: z.enum(VALID_FILTERS).optional(),
    limit: OptionalFiniteNumber,
    boardIds: z.array(z.string()).optional()
  })
  .optional()

const SearchCards = z.object({
  query: requiredString('Missing search query'),
  limit: OptionalFiniteNumber,
  boardIds: z.array(z.string()).optional()
})

const CreateCard = z.object({
  idBoard: requiredString('Board is required'),
  idList: requiredString('List is required'),
  name: requiredString('Title is required'),
  desc: OptionalPlainString
})

const UpdateCard = z.object({
  cardId: requiredString('Card ID is required'),
  updates: z.object({
    name: OptionalString,
    desc: OptionalString,
    idList: z.union([z.string(), z.null()]).optional(),
    closed: z.boolean().optional(),
    idMembers: z.array(z.string()).optional(),
    idLabels: z.array(z.string()).optional()
  })
})

const CardComment = z.object({
  cardId: requiredString('Card ID is required'),
  text: requiredString('Comment text is required')
})

export const TRELLO_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'trello.connect',
    params: Connect,
    handler: async (params, { runtime }) =>
      runtime.trelloConnect({
        apiKey: params.apiKey.trim(),
        token: params.token.trim()
      })
  }),
  defineMethod({
    name: 'trello.disconnect',
    params: null,
    handler: async (_params, { runtime }) => runtime.trelloDisconnect()
  }),
  defineMethod({
    name: 'trello.status',
    params: null,
    handler: async (_params, { runtime }) => runtime.trelloStatus()
  }),
  defineMethod({
    name: 'trello.testConnection',
    params: null,
    handler: async (_params, { runtime }) => runtime.trelloTestConnection()
  }),
  defineMethod({
    name: 'trello.listBoards',
    params: null,
    handler: async (_params, { runtime }) => runtime.trelloListBoards()
  }),
  defineMethod({
    name: 'trello.listLists',
    params: BoardId,
    handler: async (params, { runtime }) => runtime.trelloListLists(params.boardId.trim())
  }),
  defineMethod({
    name: 'trello.listBoardMembers',
    params: BoardId,
    handler: async (params, { runtime }) => runtime.trelloListBoardMembers(params.boardId.trim())
  }),
  defineMethod({
    name: 'trello.listBoardLabels',
    params: BoardId,
    handler: async (params, { runtime }) => runtime.trelloListBoardLabels(params.boardId.trim())
  }),
  defineMethod({
    name: 'trello.listCards',
    params: ListCards,
    handler: async (params, { runtime }) =>
      runtime.trelloListCards(params?.filter, params?.limit, params?.boardIds)
  }),
  defineMethod({
    name: 'trello.searchCards',
    params: SearchCards,
    handler: async (params, { runtime }) =>
      runtime.trelloSearchCards(params.query, params.limit, params.boardIds)
  }),
  defineMethod({
    name: 'trello.getCard',
    params: CardId,
    handler: async (params, { runtime }) => runtime.trelloGetCard(params.cardId.trim())
  }),
  defineMethod({
    name: 'trello.createCard',
    params: CreateCard,
    handler: async (params, { runtime }) =>
      runtime.trelloCreateCard({
        idBoard: params.idBoard.trim(),
        idList: params.idList.trim(),
        name: params.name.trim(),
        desc: params.desc?.trim() || undefined
      })
  }),
  defineMethod({
    name: 'trello.updateCard',
    params: UpdateCard,
    handler: async (params, { runtime }) =>
      runtime.trelloUpdateCard(params.cardId.trim(), params.updates)
  }),
  defineMethod({
    name: 'trello.addCardComment',
    params: CardComment,
    handler: async (params, { runtime }) =>
      runtime.trelloAddCardComment(params.cardId.trim(), params.text.trim())
  }),
  defineMethod({
    name: 'trello.cardComments',
    params: CardId,
    handler: async (params, { runtime }) => runtime.trelloCardComments(params.cardId.trim())
  })
]
