import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type {
  TrelloBoard,
  TrelloCard,
  TrelloCardFilter,
  TrelloList
} from '../../../shared/trello-types'
import { Button } from '@/components/ui/button'
import { TrelloConnectDialog } from '@/components/trello-connect-dialog'
import { TrelloCardDetail } from '@/components/trello-card-detail'
import { TrelloCreateCardDialog } from '@/components/trello-create-card-dialog'
import { TrelloIcon } from '@/components/icons/TrelloIcon'
import { useAppStore } from '@/store'
import {
  TrelloTaskSourceCardViews,
  type TrelloCardGroup
} from '@/components/trello-task-source-card-views'
import {
  TrelloTaskSourceControls,
  type TrelloGroupBy,
  type TrelloOrderBy,
  type TrelloViewMode
} from '@/components/trello-task-source-controls'

type TrelloTaskSourcePanelProps = {
  onUseCard: (card: TrelloCard, renderedText?: string) => void
}

type TrelloSelectedListSelection = {
  boardId: string
  listId: string
}

export function TrelloTaskSourcePanel({
  onUseCard
}: TrelloTaskSourcePanelProps): React.JSX.Element {
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

  const selectedListId =
    selectedListSelection.boardId === selectedBoardId ? selectedListSelection.listId : 'all'
  const setSelectedListId = useCallback(
    (listId: string): void => {
      setSelectedListSelection({ boardId: selectedBoardId, listId })
    },
    [selectedBoardId]
  )

  const boardNameById = useMemo(() => {
    const names = new Map<string, string>()
    for (const board of boards) {
      names.set(board.id, board.name)
    }
    return names
  }, [boards])

  const listNameById = useMemo(() => {
    const names = new Map<string, string>()
    for (const list of knownLists) {
      names.set(list.id, list.name)
    }
    for (const list of boardLists) {
      names.set(list.id, list.name)
    }
    for (const card of cards) {
      if (card.listName) {
        names.set(card.idList, card.listName)
      }
    }
    return names
  }, [boardLists, cards, knownLists])

  const selectedBoardLabel =
    selectedBoardId === 'all' ? 'All boards' : (boardNameById.get(selectedBoardId) ?? 'Board')
  const selectedListLabel =
    selectedListId === 'all' ? 'All lists' : (listNameById.get(selectedListId) ?? 'List')

  const visibleCards = useMemo(() => {
    if (selectedListId === 'all') {
      return cards
    }
    return cards.filter((card) => card.idList === selectedListId)
  }, [cards, selectedListId])

  const orderedCards = useMemo(() => {
    const sorted = [...visibleCards]
    sorted.sort((a, b) => {
      if (orderBy === 'title') {
        return a.name.localeCompare(b.name)
      }
      if (orderBy === 'due') {
        const aDue = a.due ? Date.parse(a.due) : Number.POSITIVE_INFINITY
        const bDue = b.due ? Date.parse(b.due) : Number.POSITIVE_INFINITY
        return aDue - bDue
      }
      return Date.parse(b.dateLastActivity || '') - Date.parse(a.dateLastActivity || '')
    })
    return sorted
  }, [orderBy, visibleCards])

  const activeBackLabel = useMemo(() => {
    if (selectedBoardId !== 'all') {
      return boardNameById.get(selectedBoardId) ?? 'Trello board'
    }
    return viewMode === 'board' ? 'Trello board' : 'Trello list'
  }, [boardNameById, selectedBoardId, viewMode])

  const groupedCards = useMemo<TrelloCardGroup[]>(() => {
    const groups: TrelloCardGroup[] = []
    const groupIndex = new Map<string, number>()
    for (const card of orderedCards) {
      const key =
        groupBy === 'none'
          ? 'all'
          : groupBy === 'list'
            ? card.idList || 'unknown-list'
            : card.idBoard || 'unknown-board'
      let index = groupIndex.get(key)
      if (index === undefined) {
        index = groups.length
        groupIndex.set(key, index)
        groups.push({
          key,
          label:
            groupBy === 'none'
              ? 'Cards'
              : groupBy === 'list'
                ? card.listName || listNameById.get(card.idList) || 'Unknown list'
                : card.boardName || boardNameById.get(card.idBoard) || 'Unknown board',
          cards: []
        })
      }
      groups[index]?.cards.push(card)
    }
    return groups
  }, [boardNameById, groupBy, listNameById, orderedCards])

  const cardsByListId = useMemo(() => {
    const grouped = new Map<string, TrelloCard[]>()
    for (const card of orderedCards) {
      const listCards = grouped.get(card.idList)
      if (listCards) {
        listCards.push(card)
      } else {
        grouped.set(card.idList, [card])
      }
    }
    return grouped
  }, [orderedCards])

  const refreshCards = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      if (!trelloStatus.connected) {
        return
      }
      setLoading(true)
      setError(null)
      try {
        const loadedBoards = await fetchTrelloBoards()
        setBoards(loadedBoards)
        const boardIds =
          selectedBoardId === 'all' ? loadedBoards.map((b) => b.id) : [selectedBoardId]
        const listGroups = await Promise.all(
          boardIds.map((boardId) => fetchTrelloLists(boardId).catch(() => [] as TrelloList[]))
        )
        setKnownLists(listGroups.flat())
        const trimmedQuery = query.trim()
        const nextCards = trimmedQuery
          ? await searchTrelloCards(
              trimmedQuery,
              50,
              boardIds.length > 0 ? boardIds : undefined,
              options
            )
          : await listTrelloCards(
              filter,
              50,
              filter === 'assigned' && selectedBoardId === 'all' ? undefined : boardIds,
              options
            )
        setCards(
          selectedBoardId === 'all'
            ? nextCards
            : nextCards.filter((card) => card.idBoard === selectedBoardId)
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Trello cards.')
      } finally {
        setLoading(false)
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
      trelloStatus.connected
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
    if (!trelloStatus.connected || selectedBoardId === 'all') {
      setBoardLists([])
      return
    }
    void fetchTrelloLists(selectedBoardId).then((lists) => {
      setBoardLists(lists.filter((list) => !list.closed))
    })
  }, [fetchTrelloLists, selectedBoardId, trelloStatus.connected])

  if (!trelloStatusChecked) {
    return (
      <div className="mt-4 flex items-center justify-center py-14">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!trelloStatus.connected) {
    return (
      <div className="mt-4 rounded-md border border-border/50 bg-muted/30 p-6 text-center">
        <TrelloIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h3 className="text-sm font-medium">Connect Trello</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Add Trello access to browse cards, search boards, and start workspaces from cards.
        </p>
        <Button className="mt-4" size="sm" onClick={() => setConnectOpen(true)}>
          Add Trello access
        </Button>
        <TrelloConnectDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={refreshCards}
        />
      </div>
    )
  }

  if (selectedCard) {
    return (
      <div className="mt-3 flex min-h-0 max-h-full flex-col">
        <TrelloCardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUse={onUseCard}
          backLabel={activeBackLabel}
          onUpdated={(updated) => {
            setSelectedCard(updated)
            setCards((prev) => prev.map((card) => (card.id === updated.id ? updated : card)))
          }}
        />
      </div>
    )
  }

  return (
    <div className="mt-3 flex min-h-0 max-h-full flex-col rounded-md border border-border/50 bg-muted/50 shadow-sm">
      <TrelloTaskSourceControls
        query={query}
        onQueryChange={setQuery}
        boards={boards}
        boardLists={boardLists}
        selectedBoardId={selectedBoardId}
        selectedBoardLabel={selectedBoardLabel}
        onBoardChange={setSelectedBoardId}
        selectedListId={selectedListId}
        selectedListLabel={selectedListLabel}
        onListChange={setSelectedListId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        orderBy={orderBy}
        onOrderByChange={setOrderBy}
        filter={filter}
        onFilterChange={setFilter}
        loading={loading}
        onRefresh={() => void refreshCards({ force: true })}
        onCreate={() => void openCreateDialog()}
      />

      {error ? (
        <p className="border-b border-border/50 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 h-full overflow-auto scrollbar-sleek scrollbar-sleek-lg">
          <TrelloTaskSourceCardViews
            loading={loading}
            orderedCards={orderedCards}
            viewMode={viewMode}
            selectedBoardId={selectedBoardId}
            boardLists={boardLists}
            cardsByListId={cardsByListId}
            groupedCards={groupedCards}
            boardNameById={boardNameById}
            listNameById={listNameById}
            onSelectCard={setSelectedCard}
            onUseCard={onUseCard}
          />
        </div>
      </div>

      <TrelloCreateCardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        boards={boards}
        defaultBoardId={selectedBoardId}
        onCreated={(card) => {
          setCards((prev) => [card, ...prev])
          setSelectedCard(card)
        }}
      />
    </div>
  )
}
