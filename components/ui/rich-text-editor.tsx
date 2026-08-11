"use client";

import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { sanitizeRichText, toDisplayHtml } from "@/lib/domain/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Editor teks berformat untuk soal dan tutorial.
 *
 * Ukuran huruf diatur lewat tingkat judul (H1-H3), bukan lewat `style`.
 * Alasannya ada di `lib/domain/rich-text.ts`: pembersih membuang semua atribut,
 * sehingga apa pun yang bergantung pada `style` tidak akan selamat sampai ke
 * halaman peserta. Tingkat judul juga membuat ukuran konsisten antar soal,
 * ketimbang tiap penyunting memilih angka piksel sendiri.
 */

type Props = {
  readonly value: string;
  readonly onChange: (html: string) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly ariaLabel?: string;
  readonly minHeight?: string;
};

type ToolButton = {
  readonly label: string;
  readonly title: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
  readonly className?: string;
};

const TOOLS: readonly (readonly ToolButton[])[] = [
  [
    {
      label: "B",
      title: "Tebal (Ctrl+B)",
      className: "font-bold",
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      label: "I",
      title: "Miring (Ctrl+I)",
      className: "italic font-serif",
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      label: "U",
      title: "Garis bawah (Ctrl+U)",
      className: "underline",
      isActive: (e) => e.isActive("underline"),
      run: (e) => e.chain().focus().toggleUnderline().run(),
    },
  ],
  [
    {
      label: "Normal",
      title: "Ukuran normal",
      isActive: (e) => e.isActive("paragraph"),
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      label: "Besar",
      title: "Ukuran besar",
      className: "text-base font-semibold",
      isActive: (e) => e.isActive("heading", { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Sangat besar",
      title: "Ukuran sangat besar",
      className: "text-lg font-semibold",
      isActive: (e) => e.isActive("heading", { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
  ],
  [
    {
      label: "• Daftar",
      title: "Daftar bertitik",
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: "1. Daftar",
      title: "Daftar bernomor",
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
  ],
];

function ToolbarButton({
  tool,
  editor,
  disabled,
}: {
  readonly tool: ToolButton;
  readonly editor: Editor;
  readonly disabled: boolean;
}) {
  const active = tool.isActive(editor);
  return (
    <button
      type="button"
      title={tool.title}
      aria-label={tool.title}
      aria-pressed={active}
      disabled={disabled}
      // Menekan tombol tidak boleh memindahkan fokus dari editor, karena
      // pindah fokus menghapus pilihan teks yang sedang mau diformat.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => tool.run(editor)}
      className={cn(
        "rounded-sm px-2 py-1 text-xs leading-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        tool.className,
      )}
    >
      {tool.label}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  id,
  ariaLabel,
  minHeight = "8rem",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Hanya tiga tingkat; lebih dari itu ukurannya tak lagi berbeda jelas
        // di halaman peserta.
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Underline,
    ],
    // Nilai lama tersimpan sebagai teks polos; `toDisplayHtml` mengubah baris
    // barunya jadi paragraf supaya tidak menciut jadi satu blok saat dibuka.
    content: toDisplayHtml(value),
    editable: !disabled,
    // Next merender komponen ini di server lebih dulu; tanpa ini React
    // memperingatkan bahwa hasil server dan klien berbeda.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose-editor focus:outline-none px-3 py-2",
          "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold",
          "[&_h3]:text-base [&_h3]:font-semibold",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_p]:min-h-[1lh]",
        ),
        style: `min-height:${minHeight}`,
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      // Dibersihkan sebelum keluar dari komponen, bukan hanya di server.
      // Server tetap membersihkan lagi — itu batas keamanan yang sebenarnya —
      // tetapi membersihkan di sini membuat apa yang tersimpan sama persis
      // dengan apa yang dilihat penyunting.
      onChange(sanitizeRichText(instance.getHTML()));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  /**
   * Menyetel ulang isi hanya ketika perubahan datang dari luar, misalnya HR
   * menekan "Batalkan". Menyetel di setiap render akan memindahkan kursor ke
   * awal tiap kali satu huruf diketik.
   */
  useEffect(() => {
    if (!editor) return;
    const incoming = toDisplayHtml(value);
    if (sanitizeRichText(editor.getHTML()) !== incoming) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className="rounded-md border border-input bg-background"
        style={{ minHeight }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background",
        "focus-within:ring-2 focus-within:ring-ring/50",
        disabled && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-input px-2 py-1.5">
        {TOOLS.map((group, index) => (
          <div key={group[0]?.label ?? index} className="flex items-center gap-1">
            {index > 0 ? <Separator orientation="vertical" className="mx-1 h-4" /> : null}
            {group.map((tool) => (
              <ToolbarButton key={tool.label} tool={tool} editor={editor} disabled={disabled} />
            ))}
          </div>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
