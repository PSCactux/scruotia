'use client';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

type Section = {
  emoji: string;
  title: string;
  body: string;
  empty: boolean;
};

function parseReport(markdown: string): Section[] {
  if (!markdown.trim()) return [];
  // Split on lines starting with "## ". Drop the leading empty piece before
  // the first heading (introductions, if the model emits one).
  const parts = markdown.split(/(?:^|\n)##\s+/).slice(1);
  return parts.map(part => {
    const newlineIdx = part.indexOf('\n');
    const heading = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1)).trim();
    // Pull leading emoji off the heading if present.
    const m = heading.match(/^(\p{Emoji}\S*)\s+(.+)$/u);
    const emoji = m ? m[1] : 'ℹ️';
    const title = m ? m[2] : heading;
    const empty = !body || /^(nada|ninguno|sin)\b/i.test(body);
    return { emoji, title, body, empty };
  });
}

const SECTION_COLORS: Record<string, { border: string; bg: string; chip: string }> = {
  '❌': { border: 'border-red-300', bg: 'bg-red-50/50', chip: 'bg-red-100 text-red-800' },
  '🪢': { border: 'border-amber-300', bg: 'bg-amber-50/50', chip: 'bg-amber-100 text-amber-800' },
  '🔗': { border: 'border-sky-300', bg: 'bg-sky-50/50', chip: 'bg-sky-100 text-sky-800' },
  '🎭': { border: 'border-violet-300', bg: 'bg-violet-50/50', chip: 'bg-violet-100 text-violet-800' },
  '📊': { border: 'border-indigo-300', bg: 'bg-indigo-50/50', chip: 'bg-indigo-100 text-indigo-800' },
  '💡': { border: 'border-emerald-300', bg: 'bg-emerald-50/50', chip: 'bg-emerald-100 text-emerald-800' },
};

export default function ValidationReport({
  markdown, streaming,
}: { markdown: string; streaming: boolean }) {
  const sections = useMemo(() => parseReport(markdown), [markdown]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!markdown && streaming) {
    return (
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        Auditando la bible…
      </div>
    );
  }
  if (!markdown && !streaming) {
    return <div className="text-sm text-slate-500">Sin informe.</div>;
  }

  // Headline summary: count non-empty sections.
  const issuesCount = sections.filter(s => !s.empty && !['💡', '📊'].includes(s.emoji)).length;
  const cleanCount = sections.filter(s => s.empty).length;

  return (
    <div className="space-y-3">
      {sections.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          {issuesCount === 0 ? (
            <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full font-medium">
              ✓ Sin problemas detectados
            </span>
          ) : (
            <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
              ⚠ {issuesCount} {issuesCount === 1 ? 'sección con hallazgos' : 'secciones con hallazgos'}
            </span>
          )}
          <span className="text-slate-500">{cleanCount} secciones limpias</span>
          {streaming && (
            <span className="ml-auto flex items-center gap-1.5 text-slate-500">
              <div className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              Continúa…
            </span>
          )}
        </div>
      )}

      {sections.map((s, i) => {
        const palette = SECTION_COLORS[s.emoji] ?? { border: 'border-slate-200', bg: 'bg-slate-50/50', chip: 'bg-slate-100 text-slate-700' };
        const isCollapsed = collapsed[s.title] ?? s.empty;
        return (
          <section
            key={i}
            className={`bg-white rounded-xl border ${palette.border} overflow-hidden`}
          >
            <button
              onClick={() => setCollapsed(c => ({ ...c, [s.title]: !isCollapsed }))}
              className={`w-full px-4 py-2.5 flex items-center gap-2 ${palette.bg} hover:bg-opacity-100 transition text-left`}
            >
              <span className="text-base">{s.emoji}</span>
              <span className="flex-1 font-medium text-slate-900 text-sm">{s.title}</span>
              {s.empty && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${palette.chip} font-medium uppercase tracking-wide`}>
                  Limpia
                </span>
              )}
              <span className="text-slate-400 text-sm">{isCollapsed ? '+' : '−'}</span>
            </button>
            {!isCollapsed && (
              <div className="p-4 prose prose-sm max-w-none text-slate-700">
                <ReactMarkdown>{s.body || '_(vacío)_'}</ReactMarkdown>
              </div>
            )}
          </section>
        );
      })}

      {sections.length === 0 && streaming && (
        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{markdown}</pre>
      )}
    </div>
  );
}
