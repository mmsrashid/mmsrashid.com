'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface Props {
  content: object
  onChange: (json: object) => void
}

const TOOLBAR_BUTTONS = [
  { label: 'B', title: 'Bold', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBold().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('bold') },
  { label: 'I', title: 'Italic', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleItalic().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('italic') },
  { label: 'H2', title: 'Heading 2', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 2 }).run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('heading', { level: 2 }) },
  { label: 'H3', title: 'Heading 3', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 3 }).run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('heading', { level: 3 }) },
  { label: '• List', title: 'Bullet list', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBulletList().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('bulletList') },
  { label: '1. List', title: 'Ordered list', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleOrderedList().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('orderedList') },
  { label: '⌥ Quote', title: 'Blockquote', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBlockquote().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('blockquote') },
  { label: '</>', title: 'Code block', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleCodeBlock().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('codeBlock') },
]

export default function TiptapEditor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate({ editor }) {
      onChange(editor.getJSON())
    },
    immediatelyRender: false,
  })

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50">
        {TOOLBAR_BUTTONS.map((btn) => (
          <button
            key={btn.title}
            type="button"
            title={btn.title}
            onClick={() => btn.cmd(editor)}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              btn.active(editor)
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 min-h-64 focus-within:outline-none"
      />
    </div>
  )
}
