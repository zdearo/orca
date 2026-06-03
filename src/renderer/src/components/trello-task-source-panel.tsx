import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, Search } from 'lucide-react'
import type { TrelloBoard, TrelloCard, TrelloCardFilter } from '../../../shared/trello-types'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrelloConnectDialog } from '@/components/trello-connect-dialog'
import { TrelloIcon } from '@/components/icons/TrelloIcon'

const FILTER_OPTIONS: { id: TrelloCardFilter; label: string }[] = [
  { id: 'assigned', label: 'Assigned' },
  { id: 'allOpen', label: 'All open' },
  { id: 'archived', label: 'Archived' }
]

export function TrelloTaskSourcePanel(): React.JSX.Element {
  const trelloStatus = useAppStore((s) => s.trelloStatus)
  const trelloStatusChecked = useAppStore((s) => s.trelloStatusChecked)
  const checkTrelloConnection = useAppStore((s) => s.checkTrelloConnection)
  const listTrelloCards = useAppStore((s) => s.listTrelloCards)
  const searchTrelloCards = useAppStore((s) => s.searchTrelloCards)
  const fetchTrelloBoards = useAppStore((s) => s.fetchTrelloBoards)

  const [connectOpen, setConnectOpen] = useState(false)
  const [filter, setFilter] = useState<TrelloCardFilter>('assigned')
  const [query, setQuery] = useState('')
  const [boards, setBoards] = useState<TrelloBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState('all')
  const [cards, setCards] = useState<TrelloCard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const boardNameById = useMemo(() => {
    const names = new Map<string, string>()
    for (const board of boards) {
      names.set(board.id, board.name)
    }
    return names
  }, [boards])

  const groupedCards = useMemo(() => {
    const groups: { boardId: string; boardName: string; cards: TrelloCard[] }[] = []
    const groupIndex = new Map<string, number>()
    for (const card of cards) {
      const boardId = card.idBoard || 'unknown'
      let index = groupIndex.get(boardId)
      if (index === undefined) {
        index = groups.length
        groupIndex.set(boardId, index)
        groups.push({
          boardId,
          boardName: card.boardName || boardNameById.get(boardId) || 'Unknown board',
          cards: []
        })
      }
      groups[index]?.cards.push(card)
    }
    return groups
  }, [boardNameById, cards])

  const refreshCards = useCallback(async (): Promise<void> => {
    if (!trelloStatus.connected) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const loadedBoards = boards.length > 0 ? boards : await fetchTrelloBoards()
      if (boards.length === 0) {
        setBoards(loadedBoards)
      }
      const boardIds = selectedBoardId === 'all' ? loadedBoards.map((b) => b.id) : [selectedBoardId]
      const trimmedQuery = query.trim()
      const nextCards = trimmedQuery
        ? await searchTrelloCards(trimmedQuery, 50, boardIds.length > 0 ? boardIds : undefined)
        : await listTrelloCards(
            filter,
            50,
            filter === 'assigned' && selectedBoardId === 'all' ? undefined : boardIds
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
  }, [
    boards,
    fetchTrelloBoards,
    filter,
    listTrelloCards,
    query,
    searchTrelloCards,
    selectedBoardId,
    trelloStatus.connected
  ])

  useEffect(() => {
    if (!trelloStatusChecked) {
      void checkTrelloConnection()
    }
  }, [checkTrelloConnection, trelloStatusChecked])

  useEffect(() => {
    void refreshCards()
  }, [refreshCards])

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

  return (
    <div className="mt-3 flex min-h-0 max-h-full flex-col rounded-md border border-border/50 bg-muted/50 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Trello cards…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <select
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
          className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2.5 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All boards</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.id}
              variant={filter === option.id ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void refreshCards()}
        >
          {loading ? <LoaderCircle className="size-3.5 mr-1.5 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="border-b border-border/50 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek scrollbar-sleek-lg">
        {loading && cards.length === 0 ? (
          <div className="flex items-center justify-center py-14">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            No Trello cards found.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {groupedCards.map((group) => (
              <section key={group.boardId} className="bg-background/20">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-muted/90 px-3 py-2 backdrop-blur">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {group.boardName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {group.cards.length} card{group.cards.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="divide-y divide-border/40">
                  {group.cards.map((card) => (
                    <button
                      key={card.id}
                      className="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
                      onClick={() => window.api.shell.openUrl(card.url)}
                    >
                      <TrelloIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {card.name}
                          </span>
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {card.desc || card.listName || card.shortUrl || card.url}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {card.listName ? (
                            <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                              {card.listName}
                            </span>
                          ) : null}
                          {card.labels
                            .filter((label) => label.name)
                            .slice(0, 4)
                            .map((label) => (
                              <span
                                key={label.id || label.name}
                                className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {label.name}
                              </span>
                            ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
