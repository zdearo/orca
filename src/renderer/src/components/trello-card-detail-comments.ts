import { useCallback, useState } from 'react'
import type { TrelloComment } from '../../../shared/trello-types'
import { useAppStore } from '@/store'

type UseTrelloCardDetailCommentsArgs = {
  cardId: string
  setError: (value: string | null) => void
}

type TrelloCardCommentState = {
  comments: TrelloComment[]
  commentsLoading: boolean
  commentsError: string | null
  commentText: string
  commentSubmitting: boolean
  setCommentText: (value: string) => void
  loadComments: (options?: { force?: boolean }) => Promise<void>
  addComment: () => Promise<void>
}

export function useTrelloCardDetailComments({
  cardId,
  setError
}: UseTrelloCardDetailCommentsArgs): TrelloCardCommentState {
  const fetchTrelloComments = useAppStore((state) => state.fetchTrelloComments)
  const addTrelloCardComment = useAppStore((state) => state.addTrelloCardComment)
  const [comments, setComments] = useState<TrelloComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const loadComments = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      setCommentsLoading(true)
      setCommentsError(null)
      try {
        setComments(await fetchTrelloComments(cardId, options))
      } catch (err) {
        setCommentsError(err instanceof Error ? err.message : 'Failed to load Trello comments.')
      } finally {
        setCommentsLoading(false)
      }
    },
    [cardId, fetchTrelloComments]
  )

  const addComment = useCallback(async (): Promise<void> => {
    const body = commentText.trim()
    if (!body || commentSubmitting) {
      return
    }
    setCommentSubmitting(true)
    try {
      const result = await addTrelloCardComment(cardId, body)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCommentText('')
      await loadComments({ force: true })
    } finally {
      setCommentSubmitting(false)
    }
  }, [addTrelloCardComment, cardId, commentSubmitting, commentText, loadComments, setError])

  return {
    comments,
    commentsLoading,
    commentsError,
    commentText,
    commentSubmitting,
    setCommentText,
    loadComments,
    addComment
  }
}
