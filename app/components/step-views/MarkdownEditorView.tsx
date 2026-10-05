'use client';
import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then(mod => mod.default),
  { ssr: false, loading: () => <div className="bg-white rounded-xl border border-slate-200 p-8 text-sm text-slate-400">Cargando editor…</div> }
);

export default function MarkdownEditorView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  return (
    <div data-color-mode="light" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={500}
        preview="live"
        visibleDragbar={false}
      />
    </div>
  );
}
