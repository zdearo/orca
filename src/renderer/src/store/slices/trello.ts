/* eslint-disable max-lines -- Why: the Trello slice owns connection status, card
   caches, and optimistic patch propagation as one store boundary so connection
   changes invalidate every related query coherently. */
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  TrelloBoard,
  TrelloCard,
  TrelloCardFilter,
  TrelloComment,
  TrelloConnectionStatus,
  TrelloLabel,
  TrelloList,
  TrelloMember,
  TrelloViewer
} from '../../../../shared/trello-types'
import type { CacheEntry } from './github'
import {
  trelloConnect,
  trelloDisconnect,
  trelloGetCard,
  trelloListCards,
  trelloSearchCards,
  trelloStatus,
  trelloTestConnection,
  trelloListBoards,
  trelloListLists,
  trelloListBoardLabels,
  trelloListBoardMembers,
  trelloAddCardComment,
  trelloCardComments
} from '@/runtime/runtime-trello-client'

const CACHE_TTL = 60_000
const MAX_CACHE_ENTRIES = 500

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

function evictStaleEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const pruned: Record<string, CacheEntry<T>> = {}
  for (const key of sorted.slice(sorted.length - maxEntries)) {
    pruned[key] = cache[key]
  }
  return pruned
}

function looksLikeAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /authenticat|unauthorized|forbidden|401|403/i.test(msg)
}

const inflightCardRequests = new Map<string, Promise<TrelloCard | null>>()
const inflightSearchRequests = new Map<string, Promise<TrelloCard[]>>()
const inflightListRequests = new Map<string, Promise<TrelloCard[]>>()

function clearTrelloInflight(): void {
  inflightCardRequests.clear()
  inflightSearchRequests.clear()
  inflightListRequests.clear()
}

export type TrelloSlice = {
  trelloStatus: TrelloConnectionStatus
  trelloStatusChecked: boolean
  trelloCardCache: Record<string, CacheEntry<TrelloCard>>
  trelloSearchCache: Record<string, CacheEntry<TrelloCard[]>>
  trelloBoardsCache: TrelloBoard[] | null
  trelloListsCache: Record<string, TrelloList[]>
  trelloCommentsCache: Record<string, CacheEntry<TrelloComment[]>>
  trelloBoardMembersCache: Record<string, TrelloMember[]>
  trelloBoardLabelsCache: Record<string, TrelloLabel[]>

  checkTrelloConnection: () => Promise<void>
  connectTrello: (args: {
    apiKey: string
    token: string
  }) => Promise<{ ok: true; viewer: TrelloViewer } | { ok: false; error: string }>
  testTrelloConnection: () => Promise<
    { ok: true; viewer: TrelloViewer } | { ok: false; error: string }
  >
  disconnectTrello: () => Promise<void>
  fetchTrelloCard: (cardId: string) => Promise<TrelloCard | null>
  searchTrelloCards: (
    query: string,
    limit?: number,
    boardIds?: string[],
    options?: { force?: boolean }
  ) => Promise<TrelloCard[]>
  listTrelloCards: (
    filter?: TrelloCardFilter,
    limit?: number,
    boardIds?: string[],
    options?: { force?: boolean }
  ) => Promise<TrelloCard[]>
  fetchTrelloBoards: () => Promise<TrelloBoard[]>
  fetchTrelloLists: (boardId: string) => Promise<TrelloList[]>
  fetchTrelloBoardMembers: (boardId: string) => Promise<TrelloMember[]>
  fetchTrelloBoardLabels: (boardId: string) => Promise<TrelloLabel[]>
  fetchTrelloComments: (cardId: string, options?: { force?: boolean }) => Promise<TrelloComment[]>
  addTrelloCardComment: (
    cardId: string,
    text: string
  ) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  patchTrelloCard: (cardId: string, patch: Partial<TrelloCard>) => void
}

export const createTrelloSlice: StateCreator<AppState, [], [], TrelloSlice> = (set, get) => ({
  trelloStatus: { connected: false, viewer: null },
  trelloStatusChecked: false,
  trelloCardCache: {},
  trelloSearchCache: {},
  trelloBoardsCache: null,
  trelloListsCache: {},
  trelloCommentsCache: {},
  trelloBoardMembersCache: {},
  trelloBoardLabelsCache: {},

  checkTrelloConnection: async () => {
    try {
      const status = await trelloStatus(get().settings)
      const prev = get().trelloStatus
      if (
        prev.connected !== status.connected ||
        prev.viewer?.username !== status.viewer?.username
      ) {
        set({ trelloStatus: status, trelloStatusChecked: true })
      } else if (!get().trelloStatusChecked) {
        set({ trelloStatusChecked: true })
      }
    } catch {
      if (get().trelloStatus.connected) {
        set({ trelloStatus: { connected: false, viewer: null }, trelloStatusChecked: true })
      } else if (!get().trelloStatusChecked) {
        set({ trelloStatusChecked: true })
      }
    }
  },

  connectTrello: async (args) => {
    try {
      const result = await trelloConnect(get().settings, args)
      if (result.ok) {
        set({ trelloStatus: { connected: true, viewer: result.viewer }, trelloStatusChecked: true })
        void get().checkTrelloConnection()
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      return { ok: false as const, error: message }
    }
  },

  testTrelloConnection: async () => {
    try {
      const result = await trelloTestConnection(get().settings)
      const status = await trelloStatus(get().settings)
      set({ trelloStatus: status, trelloStatusChecked: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed'
      return { ok: false as const, error: message }
    }
  },

  disconnectTrello: async () => {
    await trelloDisconnect(get().settings)
    clearTrelloInflight()
    const status = await trelloStatus(get().settings)
    set({
      trelloStatus: status.connected ? status : { connected: false, viewer: null },
      trelloCardCache: {},
      trelloSearchCache: {},
      trelloBoardsCache: null,
      trelloListsCache: {},
      trelloCommentsCache: {},
      trelloBoardMembersCache: {},
      trelloBoardLabelsCache: {},
      trelloStatusChecked: true
    })
  },

  fetchTrelloCard: async (cardId) => {
    const cached = get().trelloCardCache[cardId]
    if (isFresh(cached)) {
      return cached.data
    }
    const inflight = inflightCardRequests.get(cardId)
    if (inflight) {
      return inflight
    }
    const promise = trelloGetCard(get().settings, cardId)
      .then((card) => {
        set((s) => ({
          trelloCardCache: evictStaleEntries({
            ...s.trelloCardCache,
            [cardId]: { data: card, fetchedAt: Date.now() }
          })
        }))
        return card
      })
      .catch((error) => {
        console.warn('[trello] fetchTrelloCard failed:', error)
        if (looksLikeAuthError(error)) {
          set({ trelloStatus: { connected: false, viewer: null } })
        }
        return null
      })
      .finally(() => {
        inflightCardRequests.delete(cardId)
      })
    inflightCardRequests.set(cardId, promise)
    return promise
  },

  searchTrelloCards: async (query, limit = 30, boardIds, options) => {
    const cacheKey = `search::${query}::${limit}::${(boardIds ?? []).join(',')}`
    const cached = get().trelloSearchCache[cacheKey]
    if (!options?.force && isFresh(cached)) {
      return cached.data ?? []
    }
    const inflight = inflightSearchRequests.get(cacheKey)
    if (!options?.force && inflight) {
      return inflight
    }
    const promise = trelloSearchCards(get().settings, query, limit, boardIds)
      .then((cards) => {
        set((s) => ({
          trelloSearchCache: evictStaleEntries({
            ...s.trelloSearchCache,
            [cacheKey]: { data: cards, fetchedAt: Date.now() }
          })
        }))
        return cards
      })
      .catch((error) => {
        console.warn('[trello] searchTrelloCards failed:', error)
        if (looksLikeAuthError(error)) {
          set({ trelloStatus: { connected: false, viewer: null } })
        }
        return []
      })
      .finally(() => {
        inflightSearchRequests.delete(cacheKey)
      })
    inflightSearchRequests.set(cacheKey, promise)
    return promise
  },

  listTrelloCards: async (filter = 'assigned', limit = 30, boardIds, options) => {
    const cacheKey = `list::${filter}::${limit}::${(boardIds ?? []).join(',')}`
    const cached = get().trelloSearchCache[cacheKey]
    if (!options?.force && isFresh(cached)) {
      return cached.data ?? []
    }
    const inflight = inflightListRequests.get(cacheKey)
    if (!options?.force && inflight) {
      return inflight
    }
    const promise = trelloListCards(get().settings, filter, limit, boardIds)
      .then((cards) => {
        set((s) => ({
          trelloSearchCache: evictStaleEntries({
            ...s.trelloSearchCache,
            [cacheKey]: { data: cards, fetchedAt: Date.now() }
          })
        }))
        return cards
      })
      .catch((error) => {
        console.warn('[trello] listTrelloCards failed:', error)
        if (looksLikeAuthError(error)) {
          set({ trelloStatus: { connected: false, viewer: null } })
        }
        return []
      })
      .finally(() => {
        inflightListRequests.delete(cacheKey)
      })
    inflightListRequests.set(cacheKey, promise)
    return promise
  },

  fetchTrelloBoards: async () => {
    const cached = get().trelloBoardsCache
    if (cached !== null) {
      return cached
    }
    try {
      const boards = await trelloListBoards(get().settings)
      set({ trelloBoardsCache: boards })
      return boards
    } catch {
      return []
    }
  },

  fetchTrelloLists: async (boardId) => {
    const cached = get().trelloListsCache[boardId]
    if (cached) {
      return cached
    }
    try {
      const lists = await trelloListLists(get().settings, boardId)
      set((s) => ({
        trelloListsCache: { ...s.trelloListsCache, [boardId]: lists }
      }))
      return lists
    } catch {
      return []
    }
  },

  fetchTrelloBoardMembers: async (boardId) => {
    const cached = get().trelloBoardMembersCache[boardId]
    if (cached) {
      return cached
    }
    try {
      const members = await trelloListBoardMembers(get().settings, boardId)
      set((s) => ({
        trelloBoardMembersCache: { ...s.trelloBoardMembersCache, [boardId]: members }
      }))
      return members
    } catch {
      return []
    }
  },

  fetchTrelloBoardLabels: async (boardId) => {
    const cached = get().trelloBoardLabelsCache[boardId]
    if (cached) {
      return cached
    }
    try {
      const labels = await trelloListBoardLabels(get().settings, boardId)
      set((s) => ({
        trelloBoardLabelsCache: { ...s.trelloBoardLabelsCache, [boardId]: labels }
      }))
      return labels
    } catch {
      return []
    }
  },

  fetchTrelloComments: async (cardId, options) => {
    const cached = get().trelloCommentsCache[cardId]
    if (!options?.force && isFresh(cached)) {
      return cached.data ?? []
    }
    try {
      const comments = await trelloCardComments(get().settings, cardId)
      set((s) => ({
        trelloCommentsCache: {
          ...s.trelloCommentsCache,
          [cardId]: { data: comments, fetchedAt: Date.now() }
        }
      }))
      return comments
    } catch {
      return []
    }
  },

  addTrelloCardComment: async (cardId, text) => {
    try {
      const result = await trelloAddCardComment(get().settings, cardId, text)
      if (result.ok) {
        // Invalidate comments cache for this card
        set((s) => {
          const next = { ...s.trelloCommentsCache }
          delete next[cardId]
          return { trelloCommentsCache: next }
        })
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Comment failed'
      return { ok: false as const, error: message }
    }
  },

  patchTrelloCard: (cardId, patch) => {
    set((s) => {
      let changed = false
      const nextCardCache = { ...s.trelloCardCache }
      for (const [key, entry] of Object.entries(nextCardCache)) {
        if (entry?.data?.id !== cardId) {
          continue
        }
        nextCardCache[key] = { ...entry, data: { ...entry.data, ...patch }, fetchedAt: 0 }
        changed = true
      }
      const nextSearchCache = { ...s.trelloSearchCache }
      for (const key of Object.keys(nextSearchCache)) {
        const entry = nextSearchCache[key]
        if (!entry?.data) {
          continue
        }
        const index = entry.data.findIndex((card) => card.id === cardId)
        if (index === -1) {
          continue
        }
        const updatedItems = [...entry.data]
        updatedItems[index] = { ...updatedItems[index], ...patch }
        nextSearchCache[key] = { ...entry, data: updatedItems }
        changed = true
      }
      return changed ? { trelloCardCache: nextCardCache, trelloSearchCache: nextSearchCache } : {}
    })
  }
})
