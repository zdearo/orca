import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  TrelloBoard,
  TrelloCard,
  TrelloCardFilter,
  TrelloList
} from '../../../shared/trello-types'
import { useAppStore } from '@/store'
import type {
  TrelloGroupBy,
  TrelloOrderBy,
  TrelloViewMode
} from '@/components/trello-task-source-controls'
import type { TrelloTaskSourceController } from '@/components/trello-task-source-controller-types'
import { useTrelloTaskSourceCardDerivations } from '@/components/trello-task-source-card-derivations'

type TrelloSelectedListSelection = {
  boardId: string
  listId: string
}

export function useTrelloTaskSourceController(): TrelloTaskSourceController {
  const trelloStatus = useAppStore((s) => s.trelloStatus)
  const trelloStatusChecked = useAppStore((s) => s.trelloStatusChecked)
  const checkTrelloConnection = useAppStore((s) => s.checkTrelloConnection)
  const listTrelloCards = useAppStore((s) => s.listTrelloCards)
  const searchTrelloCards = useAppStore((s) => s.searchTrelloCards)
  const fetchTrelloBoards = useAppStore((s) => s.fetchTrelloBoards)
  const fetchTrelloLists = useAppStore((s) => s.fetchTrelloLists)

  const [connectOpen, setConnectOpen] = useState(false)
  const [filter, setFilter] = useState<TrelloCardFilter>('allOpen')
  const [query, setQuery] = useState('')
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState('all')
  const [selectedListSelection, setSelectedListSelection] = useState<TrelloSelectedListSelection>({
    boardId: 'all',
    listId: 'all'
  })
  const [cards, setCards] = useState<TrelloCard[]>([])
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [boardLists, setBoardLists] = useState<TrelloList[]>([])
  const [knownLists, setKnownLists] = useState<TrelloList[]>([])
  const [viewMode, setViewMode] = useState<TrelloViewMode>('list')
  const [groupBy, setGroupBy] = useState<TrelloGroupBy>('board')
  const [orderBy, setOrderBy] = useState<TrelloOrderBy>('activity')
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const selectedListId =
    selectedListSelection.boardId === selectedBoardId ? selectedListSelection.listId : 'all'
  const cardRequestIdRef = useRef(0)
  const boardListsRequestIdRef = useRef(0)

  const cardMatchesFilter = useCallback(
    (card: TrelloCard): boolean => {
      if (filter === 'archived') {
        return card.closed
      }
      if (filter === 'allOpen') {
        return !card.closed
      }
      const viewerId = trelloStatus.viewer?.id
      return viewerId ? card.members.some((member) => member.id === viewerId) : true
    },
    [filter, trelloStatus.viewer?.id]
  )

  const setSelectedListId = useCallback(
    (listId: string): void => {
      setSelectedListSelection({ boardId: selectedBoardId, listId })
    },
    [selectedBoardId]
  )

  const {
    selectedBoardLabel,
    selectedListLabel,
    orderedCards,
    groupedCards,
    cardsByListId,
    boardNameById,
    listNameById,
    activeBackLabel
  } = useTrelloTaskSourceCardDerivations({
    boards,
    knownLists,
    boardLists,
    cards,
    selectedBoardId,
    selectedListId,
    viewMode,
    groupBy,
    orderBy
  })

  const refreshCards = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (!trelloStatus.connected) {
        return
      }
      const requestId = ++cardRequestIdRef.current
      setLoading(true)
      setError(null)
      try {
        const loadedBoards = await fetchTrelloBoards()
        if (requestId !== cardRequestIdRef.current) {
          return
        }
        setBoards(loadedBoards)
        const boardIds =
          selectedBoardId === 'all' ? loadedBoards.map((board) => board.id) : [selectedBoardId]
        const listGroups = await Promise.all(
          boardIds.map((boardId) => fetchTrelloLists(boardId).catch(() => [] as TrelloList[]))
        )
        if (requestId !== cardRequestIdRef.current) {
          return
        }
        setKnownLists(listGroups.flat())
        const trimmedQuery = query.trim()
        let nextCards: TrelloCard[]
        let isTruncated = false
        if (trimmedQuery) {
          const searchResults = await searchTrelloCards(
            trimmedQuery,
            50,
            boardIds.length > 0 ? boardIds : undefined,
            options
          )
          if (requestId !== cardRequestIdRef.current) {
            return
          }
          // Trello search caps at 50 results; treat a full page as potentially truncated.
          isTruncated = searchResults.length >= 50
          // Reconcile search with filter: apply the same filter semantics as browsing
          // when Trello search cannot combine the list filter server-side.
          const viewerId = trelloStatus.viewer?.id
          nextCards = searchResults.filter((card) => {
            if (filter === 'archived') {
              return card.closed
            }
            if (filter === 'allOpen') {
              return !card.closed
            }
            return viewerId ? card.members.some((member) => member.id === viewerId) : true
          })
        } else {
          nextCards = await listTrelloCards(
            filter,
            50,
            filter === 'assigned' && selectedBoardId === 'all' ? undefined : boardIds,
            options
          )
          if (requestId !== cardRequestIdRef.current) {
            return
          }
          isTruncated = nextCards.length >= 50
        }
        const filteredCards =
          selectedBoardId === 'all'
            ? nextCards
            : nextCards.filter((card) => card.idBoard === selectedBoardId)
        setCards(filteredCards)
        setTruncated(isTruncated)
      } catch (err) {
        if (requestId !== cardRequestIdRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load Trello cards.')
      } finally {
        if (requestId === cardRequestIdRef.current) {
          setLoading(false)
        }
      }
    },
    [
      fetchTrelloBoards,
      fetchTrelloLists,
      filter,
      listTrelloCards,
      query,
      searchTrelloCards,
      selectedBoardId,
      trelloStatus.connected,
      trelloStatus.viewer?.id
    ]
  )

  const openCreateDialog = useCallback(async (): Promise<void> => {
    if (boards.length === 0) {
      setLoading(true)
      setError(null)
      try {
        const loadedBoards = await fetchTrelloBoards()
        setBoards(loadedBoards)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Trello boards.')
        return
      } finally {
        setLoading(false)
      }
    }
    setCreateOpen(true)
  }, [boards.length, fetchTrelloBoards])

  useEffect(() => {
    if (!trelloStatusChecked) {
      void checkTrelloConnection()
    }
  }, [checkTrelloConnection, trelloStatusChecked])

  useEffect(() => {
    void refreshCards()
  }, [refreshCards])

  useEffect(() => {
    const requestId = ++boardListsRequestIdRef.current
    if (!trelloStatus.connected || selectedBoardId === 'all') {
      setBoardLists([])
      return
    }
    void fetchTrelloLists(selectedBoardId).then((lists) => {
      if (requestId !== boardListsRequestIdRef.current) {
        return
      }
      setBoardLists(lists.filter((list) => !list.closed))
    })
  }, [fetchTrelloLists, selectedBoardId, trelloStatus.connected])

  const handleSelectedCardUpdated = useCallback(
    (updated: TrelloCard): void => {
      setSelectedCard(updated)
      setCards((prev) => {
        if (!cardMatchesFilter(updated)) {
          return prev.filter((card) => card.id !== updated.id)
        }
        return prev.map((card) => (card.id === updated.id ? updated : card))
      })
    },
    [cardMatchesFilter]
  )

  const handleCreatedCard = useCallback(
    (card: TrelloCard): void => {
      if (cardMatchesFilter(card)) {
        setCards((prev) => [card, ...prev])
      }
      setSelectedCard(card)
    },
    [cardMatchesFilter]
  )

  return {
    trelloStatus,
    trelloStatusChecked,
    connectOpen,
    setConnectOpen,
    createOpen,
    setCreateOpen,
    filter,
    setFilter,
    query,
    setQuery,
    boards,
    selectedBoardId,
    setSelectedBoardId,
    selectedListId,
    setSelectedListId,
    selectedBoardLabel,
    selectedListLabel,
    boardLists,
    selectedCard,
    setSelectedCard,
    viewMode,
    setViewMode,
    groupBy,
    setGroupBy,
    orderBy,
    setOrderBy,
    loading,
    error,
    truncated,
    orderedCards,
    groupedCards,
    cardsByListId,
    boardNameById,
    listNameById,
    activeBackLabel,
    refreshCards,
    openCreateDialog,
    onSelectedCardUpdated: handleSelectedCardUpdated,
    onCreatedCard: handleCreatedCard
  }
}
