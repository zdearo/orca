import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clipboard, ExternalLink, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TrelloCard,
  TrelloComment,
  TrelloLabel,
  TrelloList,
  TrelloMember
} from '../../../shared/trello-types'
import { LinearIssueMarkdownDescriptionEditor } from '@/components/LinearIssueMarkdownDescriptionEditor'
import { getScreenSubmitShortcutLabel } from '@/lib/screen-submit-shortcut'
import { useAppStore } from '@/store'
import { trelloUpdateCard } from '@/runtime/runtime-trello-client'
import { Button } from '@/components/ui/button'
import { TrelloCardDetailActivity } from '@/components/trello-card-detail-activity'
import { TrelloCardDetailHeader } from '@/components/trello-card-detail-header'
import type { TrelloCardDetailActionItem } from '@/components/trello-card-detail-sidebar'
import { TrelloCardDetailSidebar } from '@/components/trello-card-detail-sidebar'
import { renderCardContext } from '@/components/trello-card-detail-text'

type TrelloCardDetailProps = {
  card: TrelloCard
  onClose: () => void
  onUpdated: (card: TrelloCard) => void
  onUse: (card: TrelloCard, renderedText?: string) => void
  backLabel?: string
}

async function copyTextToClipboard(text: string, label: string): Promise<void> {
  try {
    await window.api.ui.writeClipboardText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`)
  }
}

export function TrelloCardDetail({
  card,
  onClose,
  onUpdated,
  onUse,
  backLabel
}: TrelloCardDetailProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const fetchTrelloCard = useAppStore((s) => s.fetchTrelloCard)
  const fetchTrelloLists = useAppStore((s) => s.fetchTrelloLists)
  const fetchTrelloComments = useAppStore((s) => s.fetchTrelloComments)
  const fetchTrelloBoardMembers = useAppStore((s) => s.fetchTrelloBoardMembers)
  const fetchTrelloBoardLabels = useAppStore((s) => s.fetchTrelloBoardLabels)
  const addTrelloCardComment = useAppStore((s) => s.addTrelloCardComment)
  const patchTrelloCard = useAppStore((s) => s.patchTrelloCard)

  const [displayed, setDisplayed] = useState(card)
  const [title, setTitle] = useState(card.name)
  const [description, setDescription] = useState(card.desc)
  const [listId, setListId] = useState(card.idList)
  const [lists, setLists] = useState<TrelloList[]>([])
  const [comments, setComments] = useState<TrelloComment[]>([])
  const [boardMembers, setBoardMembers] = useState<TrelloMember[]>([])
  const [boardLabels, setBoardLabels] = useState<TrelloLabel[]>([])
  const [loading, setLoading] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [commentsError, setCommentsError] = useState<string | null>(null)
  const selectedList = useMemo(
    () => lists.find((list) => list.id === listId) ?? null,
    [listId, lists]
  )

  const dirty = useMemo(
    () => title !== displayed.name || description !== displayed.desc || listId !== displayed.idList,
    [description, displayed.desc, displayed.idList, displayed.name, listId, title]
  )

  const loadDetails = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [fullCard, nextLists, nextMembers, nextLabels] = await Promise.all([
        fetchTrelloCard(card.id),
        fetchTrelloLists(card.idBoard),
        fetchTrelloBoardMembers(card.idBoard),
        fetchTrelloBoardLabels(card.idBoard)
      ])
      const nextCard = fullCard ?? card
      setDisplayed(nextCard)
      setTitle(nextCard.name)
      setDescription(nextCard.desc)
      setListId(nextCard.idList)
      setLists(nextLists.filter((list) => !list.closed || list.id === nextCard.idList))
      setBoardMembers(nextMembers)
      setBoardLabels(nextLabels)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Trello card.')
    } finally {
      setLoading(false)
    }
  }, [card, fetchTrelloBoardLabels, fetchTrelloBoardMembers, fetchTrelloCard, fetchTrelloLists])

  const loadComments = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        setComments(await fetchTrelloComments(card.id, options))
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load Trello comments.')
      } finally {
        setCommentsLoading(false)
      }
    },
    [card.id, fetchTrelloComments]
  )

  useEffect(() => {
    setDisplayed(card)
    setTitle(card.name)
    setDescription(card.desc)
    setListId(card.idList)
    void loadDetails()
    void loadComments({ force: true })
  }, [card, loadComments, loadDetails])

  const applyUpdatedCard = (updated: TrelloCard): void => {
    setDisplayed(updated)
    setTitle(updated.name)
    setDescription(updated.desc)
    setListId(updated.idList)
    patchTrelloCard(updated.id, updated)
    onUpdated(updated)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, {
        name: title.trim(),
        desc: description,
        idList: listId
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({
        ...displayed,
        name: title.trim(),
        desc: description,
        idList: listId,
        listName: selectedList?.name ?? displayed.listName
      })
      toast.success('Trello card updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello card.')
    } finally {
      setSaving(false)
    }
  }

  const handleDescriptionSave = async (nextDescription: string): Promise<void> => {
    if (nextDescription === displayed.desc) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { desc: nextDescription })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({ ...displayed, desc: nextDescription })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello description.')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { closed: !displayed.closed })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({ ...displayed, closed: !displayed.closed })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update archived state.')
    } finally {
      setSaving(false)
    }
  }

  const handleListChange = async (nextListId: string): Promise<void> => {
    setListId(nextListId)
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { idList: nextListId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({
        ...displayed,
        idList: nextListId,
        listName: lists.find((list) => list.id === nextListId)?.name ?? displayed.listName
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello list.')
    } finally {
      setSaving(false)
    }
  }

  const handleMemberToggle = async (memberId: string): Promise<void> => {
    const currentIds = displayed.members.map((member) => member.id)
    const nextIds = currentIds.includes(memberId)
      ? currentIds.filter((id) => id !== memberId)
      : [...currentIds, memberId]
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { idMembers: nextIds })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({
        ...displayed,
        members: boardMembers.filter((member) => nextIds.includes(member.id))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello members.')
    } finally {
      setSaving(false)
    }
  }

  const handleLabelToggle = async (labelId: string): Promise<void> => {
    const currentIds = displayed.labels.map((label) => label.id)
    const nextIds = currentIds.includes(labelId)
      ? currentIds.filter((id) => id !== labelId)
      : [...currentIds, labelId]
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { idLabels: nextIds })
      if (!result.ok) {
        setError(result.error)
        return
      }
      applyUpdatedCard({
        ...displayed,
        labels: boardLabels.filter((label) => nextIds.includes(label.id))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello labels.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddComment = async (): Promise<void> => {
    const body = commentText.trim()
    if (!body) {
      return
    }
    const result = await addTrelloCardComment(displayed.id, body)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCommentText('')
    await loadComments({ force: true })
  }

  const renderedContext = renderCardContext(displayed)
  const actionItems: TrelloCardDetailActionItem[] = [
    {
      label: 'Copy URL',
      icon: Clipboard,
      action: () => void copyTextToClipboard(displayed.url, 'URL')
    },
    {
      label: 'Copy short link',
      icon: Clipboard,
      action: () => void copyTextToClipboard(displayed.shortLink || displayed.id, 'Short link')
    },
    {
      label: 'Copy prompt',
      icon: Clipboard,
      action: () => void copyTextToClipboard(renderedContext, 'Prompt')
    },
    {
      label: 'Open in Trello',
      icon: ExternalLink,
      action: () => window.api.shell.openUrl(displayed.url)
    }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
      <TrelloCardDetailHeader
        card={displayed}
        loading={loading}
        backLabel={backLabel}
        onClose={onClose}
        onCopyUrl={() => void copyTextToClipboard(displayed.url, 'URL')}
        onCopyShortLink={() =>
          void copyTextToClipboard(displayed.shortLink || displayed.id, 'Short link')
        }
        onStartWorkspace={() => onUse(displayed, renderedContext)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <div className="mx-auto grid w-full grid-cols-1 gap-10 px-7 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-10 xl:px-12">
          <main className="min-w-0">
            {error ? (
              <p className="mb-5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <section className="space-y-5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Card title"
                className="w-full border-none bg-transparent p-0 text-3xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 focus-visible:ring-0"
              />
              <LinearIssueMarkdownDescriptionEditor
                value={description}
                onChange={setDescription}
                onSave={(nextValue) => void handleDescriptionSave(nextValue)}
                density="page"
                disabled={saving}
                submitShortcutLabel={getScreenSubmitShortcutLabel()}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
                <Button size="sm" onClick={() => void handleSave()} disabled={!dirty || saving}>
                  {saving ? <LoaderCircle className="mr-1 size-3.5 animate-spin" /> : null}
                  Save changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleArchiveToggle()}
                  disabled={saving}
                >
                  {displayed.closed ? 'Unarchive' : 'Archive'}
                </Button>
              </div>
            </section>

            <TrelloCardDetailActivity
              card={displayed}
              comments={comments}
              commentsLoading={commentsLoading}
              commentsError={commentsError}
              commentText={commentText}
              onCommentTextChange={setCommentText}
              onRetryComments={() => void loadComments({ force: true })}
              onAddComment={() => void handleAddComment()}
            />
          </main>

          <TrelloCardDetailSidebar
            card={displayed}
            listId={listId}
            lists={lists}
            boardMembers={boardMembers}
            boardLabels={boardLabels}
            saving={saving}
            actionItems={actionItems}
            onListChange={(nextListId) => void handleListChange(nextListId)}
            onMemberToggle={(memberId) => void handleMemberToggle(memberId)}
            onLabelToggle={(labelId) => void handleLabelToggle(labelId)}
          />
        </div>
      </div>
    </div>
  )
}
