// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import { createRichMarkdownExtensions } from './rich-markdown-extensions'

function nextMicrotask(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  return promise
}

describe('rich markdown Trello image node view', () => {
  it('uses the custom resolver for Trello markdown images', async () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const resolver = vi.fn(async () => 'blob:trello-image')
    const markdown =
      '![Screenshot](https://api.trello.com/1/cards/card-1/attachments/a-1/download/image.png)'
    const editor = new Editor({
      element,
      extensions: createRichMarkdownExtensions({ resolveImageSrc: resolver }),
      content: encodeRawMarkdownHtmlForRichEditor(markdown),
      contentType: 'markdown'
    })

    await nextMicrotask()

    expect(resolver).toHaveBeenCalledWith(
      'https://api.trello.com/1/cards/card-1/attachments/a-1/download/image.png'
    )
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:trello-image')
    expect(editor.getMarkdown()).toBe(markdown)
    editor.destroy()
  })
})
