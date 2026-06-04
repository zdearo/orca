import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  TrelloCard,
  TrelloLabel,
  TrelloList,
  TrelloMember
} from '../../../shared/trello-types'
import { useAppStore } from '@/store'
import { trelloUpdateCard } from '@/runtime/runtime-trello-client'
import { TrelloCardDetailHeader } from '@/components/trello-card-detail-header'
import { TrelloCardDetailMainColumn } from '@/components/trello-card-detail-main-column'
import { TrelloCardDetailSidebar } from '@/components/trello-card-detail-sidebar'
import {
  copyTrelloCardDetailText,
  createTrelloCardDetailActionItems
} from '@/components/trello-card-detail-actions'
import { loadTrelloCardDetailData } from '@/components/trello-card-detail-data'
import { useTrelloCardDetailComments } from '@/components/trello-card-detail-comments'
import { saveTrelloCardChanges } from '@/components/trello-card-detail-save'
import { renderCardContext } from '@/components/trello-card-detail-text'
import { createTrelloImageSrcResolver } from '@/lib/trello-authenticated-images'
import { prepareTrelloDescriptionForSave } from '@/lib/trello-description-images'

type TrelloCardDetailProps = {
  card: TrelloCard
  onClose: () => void
  onUpdated: (card: TrelloCard) => void
  onUse: (card: TrelloCard, renderedText?: string) => void
  backLabel?: string
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
  const fetchTrelloBoardMembers = useAppStore((s) => s.fetchTrelloBoardMembers)
  const fetchTrelloBoardLabels = useAppStore((s) => s.fetchTrelloBoardLabels)
  const patchTrelloCard = useAppStore((s) => s.patchTrelloCard)

  const [displayed, setDisplayed] = useState(card)
  const [title, setTitle] = useState(card.name)
  const [description, setDescription] = useState(card.desc)
  const [listId, setListId] = useState(card.idList)
  const [lists, setLists] = useState<TrelloList[]>([])
  const [boardMembers, setBoardMembers] = useState<TrelloMember[]>([])
  const [boardLabels, setBoardLabels] = useState<TrelloLabel[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyFieldsRef = useRef({ title: false, description: false, listId: false })
  const prevCardIdRef = useRef(card.id)

  const trelloStatus = useAppStore((s) => s.trelloStatus)
  const resolveTrelloImageSrc = useMemo(
    () =>
      createTrelloImageSrcResolver(settings, {
        runtimeEnvironmentId: settings?.activeRuntimeEnvironmentId,
        accountId: trelloStatus.viewer?.username
      }),
    [settings, trelloStatus.viewer?.username]
  )

  const dirty = useMemo(
    () => title !== displayed.name || description !== displayed.desc || listId !== displayed.idList,
    [description, displayed.desc, displayed.idList, displayed.name, listId, title]
  )

  const applyFreshCard = useCallback(
    (nextCard: TrelloCard, options?: { notifyParent?: boolean }): void => {
      setDisplayed(nextCard)
      if (!dirtyFieldsRef.current.title) {
        setTitle(nextCard.name)
      }
      if (!dirtyFieldsRef.current.description) {
        setDescription(nextCard.desc)
      }
      if (!dirtyFieldsRef.current.listId) {
        setListId(nextCard.idList)
      }
      patchTrelloCard(nextCard.id, nextCard)
      if (options?.notifyParent === true) {
        onUpdated(nextCard)
      }
    },
    [onUpdated, patchTrelloCard]
  )

  const applyUpdatedCard = useCallback(
    (updated: TrelloCard): void => {
      dirtyFieldsRef.current = { title: false, description: false, listId: false }
      setDisplayed(updated)
      setTitle(updated.name)
      setDescription(updated.desc)
      setListId(updated.idList)
      patchTrelloCard(updated.id, updated)
      onUpdated(updated)
    },
    [onUpdated, patchTrelloCard]
  )

  const loadDetails = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const nextData = await loadTrelloCardDetailData({
        card,
        fetchTrelloCard,
        fetchTrelloLists,
        fetchTrelloBoardMembers,
        fetchTrelloBoardLabels
      })
      applyFreshCard(nextData.card)
      setLists(nextData.lists)
      setBoardMembers(nextData.boardMembers)
      setBoardLabels(nextData.boardLabels)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Trello card.')
    } finally {
      setLoading(false)
    }
  }, [
    applyFreshCard,
    card,
    fetchTrelloBoardLabels,
    fetchTrelloBoardMembers,
    fetchTrelloCard,
    fetchTrelloLists
  ])

  const {
    comments,
    commentsLoading,
    commentsError,
    commentText,
    commentSubmitting,
    setCommentText,
    loadComments,
    addComment
  } = useTrelloCardDetailComments({ cardId: card.id, setError })

  useEffect(() => {
    const cardIdChanged = card.id !== prevCardIdRef.current
    if (cardIdChanged) {
      prevCardIdRef.current = card.id
      dirtyFieldsRef.current = { title: false, description: false, listId: false }
      setDisplayed(card)
      setTitle(card.name)
      setDescription(card.desc)
      setListId(card.idList)
    } else {
      setDisplayed(card)
      if (!dirtyFieldsRef.current.title) {
        setTitle(card.name)
      }
      if (!dirtyFieldsRef.current.description) {
        setDescription(card.desc)
      }
      if (!dirtyFieldsRef.current.listId) {
        setListId(card.idList)
      }
    }
    void loadDetails()
    void loadComments({ force: true })
  }, [card, loadComments, loadDetails])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const updatedCard = await saveTrelloCardChanges({
        settings,
        cardId: displayed.id,
        title,
        description,
        listId,
        fetchTrelloCard
      })
      if (updatedCard) {
        applyUpdatedCard(updatedCard)
        toast.success('Trello card updated')
      }
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
      const preparedDescription = await prepareTrelloDescriptionForSave({
        cardId: displayed.id,
        description: nextDescription,
        settings
      })
      const result = await trelloUpdateCard(settings, displayed.id, { desc: preparedDescription })
      if (!result.ok) {
        setError(result.error)
        return
      }
      dirtyFieldsRef.current.description = false
      const updatedCard = await fetchTrelloCard(displayed.id, { force: true })
      if (updatedCard) {
        applyFreshCard(updatedCard)
      } else {
        applyFreshCard({ ...displayed, desc: preparedDescription })
      }
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
      applyFreshCard({ ...displayed, closed: !displayed.closed }, { notifyParent: true })
      const fresh = await fetchTrelloCard(displayed.id, { force: true })
      if (fresh) {
        applyFreshCard(fresh, { notifyParent: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update archived state.')
    } finally {
      setSaving(false)
    }
  }

  const handleListChange = async (nextListId: string): Promise<void> => {
    setListId(nextListId)
    dirtyFieldsRef.current.listId = true
    setSaving(true)
    setError(null)
    try {
      const result = await trelloUpdateCard(settings, displayed.id, { idList: nextListId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const optimistic = {
        ...displayed,
        idList: nextListId,
        listName: lists.find((list) => list.id === nextListId)?.name ?? displayed.listName
      }
      applyFreshCard(optimistic, { notifyParent: true })
      dirtyFieldsRef.current.listId = false
      const fresh = await fetchTrelloCard(displayed.id, { force: true })
      if (fresh) {
        applyFreshCard(fresh, { notifyParent: true })
      }
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
      applyFreshCard(
        {
          ...displayed,
          members: boardMembers.filter((member) => nextIds.includes(member.id))
        },
        { notifyParent: true }
      )
      const fresh = await fetchTrelloCard(displayed.id, { force: true })
      if (fresh) {
        applyFreshCard(fresh, { notifyParent: true })
      }
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
      applyFreshCard(
        {
          ...displayed,
          labels: boardLabels.filter((label) => nextIds.includes(label.id))
        },
        { notifyParent: true }
      )
      const fresh = await fetchTrelloCard(displayed.id, { force: true })
      if (fresh) {
        applyFreshCard(fresh, { notifyParent: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Trello labels.')
    } finally {
      setSaving(false)
    }
  }

  const renderedContext = renderCardContext(displayed)
  const actionItems = createTrelloCardDetailActionItems(displayed, renderedContext)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
      <TrelloCardDetailHeader
        card={displayed}
        loading={loading}
        backLabel={backLabel}
        onClose={onClose}
        onCopyUrl={() => void copyTrelloCardDetailText(displayed.url, 'URL')}
        onCopyShortLink={() =>
          void copyTrelloCardDetailText(displayed.shortLink || displayed.id, 'Short link')
        }
        onStartWorkspace={() => onUse(displayed, renderedContext)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <div className="mx-auto grid w-full grid-cols-1 gap-10 px-7 py-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-10 xl:px-12">
          <TrelloCardDetailMainColumn
            card={displayed}
            title={title}
            description={description}
            dirty={dirty}
            saving={saving}
            error={error}
            comments={comments}
            commentsLoading={commentsLoading}
            commentsError={commentsError}
            commentText={commentText}
            commentSubmitting={commentSubmitting}
            resolveTrelloImageSrc={resolveTrelloImageSrc}
            onTitleChange={(nextValue) => {
              dirtyFieldsRef.current.title = nextValue !== displayed.name
              setTitle(nextValue)
            }}
            onDescriptionChange={(value) => {
              dirtyFieldsRef.current.description = value !== displayed.desc
              setDescription(value)
            }}
            onDescriptionSave={(nextValue) => void handleDescriptionSave(nextValue)}
            onSave={() => void handleSave()}
            onArchiveToggle={() => void handleArchiveToggle()}
            onCommentTextChange={setCommentText}
            onRetryComments={() => void loadComments({ force: true })}
            onAddComment={() => void addComment()}
          />

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
