'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export type MobileMessage = {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: Array<{ question: string; options?: string[] } | string>;
  touched?: string[];
};

type Props = {
  slug: string;
  title: string;
  entityCount: number;
  initialMessages: MobileMessage[];
};

/**
 * Mobile-first chat. Single column, big tap targets, no canvas.
 *
 * Same /api/chat backend as desktop — what differs is the surface. Strip
 * protocol blocks from the displayed bubble exactly like ChatColumn does.
 */
export default function MobileChat({ slug, title, entityCount, initialMessages }: Props) {
  const [messages, setMessages] = useState<MobileMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [applying, setApplying] = useState<{ cards: number; patches: number; links: number; deletes: number; facts: number } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { if (!streaming) inputRef.current?.focus(); }, [streaming]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const next: MobileMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectSlug: slug,
        mode: 'project',
        messages: next.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.body) { setStreaming(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    const STATUS_RE = /\n?~~~scruotia-status\n([\s\S]*?)\n~~~\n?/g;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      for (const m of acc.matchAll(STATUS_RE)) {
        try {
          const ev = JSON.parse(m[1]) as { phase?: string; [k: string]: unknown };
          if (ev.phase === 'applying') {
            setApplying({
              cards: (ev.cards as number) ?? 0,
              patches: (ev.patches as number) ?? 0,
              links: (ev.links as number) ?? 0,
              deletes: (ev.deletes as number) ?? 0,
              facts: (ev.facts as number) ?? 0,
            });
            setStreaming(false);
          } else if (ev.phase === 'done') {
            setApplying(null);
          }
        } catch {/* ignore */}
      }
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: acc };
        return copy;
      });
    }
    setStreaming(false);
    setApplying(null);

    // Suggestions parsing (subset of ChatColumn — buttons only, no chooser).
    const sList = [...acc.matchAll(/<<<\s*SUGGEST\s*>>>([\s\S]*?)<<<\s*END\s*>>>/g)]
      .map(m => m[1].trim()).filter(Boolean)
      .map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const qLines: string[] = []; const opts: string[] = [];
        for (const line of lines) {
          const bm = line.match(/^[-*•]\s+(.+)$/);
          if (bm) opts.push(bm[1].trim());
          else if (opts.length === 0) qLines.push(line);
        }
        return { question: qLines.join(' ').trim(), options: opts.length > 0 ? opts : undefined };
      })
      .filter(s => s.question);
    if (sList.length > 0) {
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, suggestions: sList };
        return copy;
      });
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <header className="px-3 py-2.5 border-b-2 border-slate-200 bg-white flex items-center gap-2 shadow-sm">
        <button onClick={() => setDrawer(true)} className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-xl" aria-label="Menú">☰</button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-indigo-600 font-bold leading-tight">Mobile · {entityCount} entidades</div>
          <h1 className="text-sm font-bold text-slate-900 truncate leading-tight">{title}</h1>
        </div>
        <Link href={`/p/${slug}`} className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold" title="Abrir vista desktop">
          🖥️
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-slate-50/40">
        {isEmpty && (
          <div className="max-w-md mx-auto py-10 text-center">
            <div className="text-5xl mb-3">📱</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Captura ideas al vuelo</h2>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Modo móvil: solo el chat. Lo que captures aquí aparecerá organizado en la vista desktop con sus cards, mapa y demás.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => send('Proponme un borrador inicial de esta historia: un protagonista posible, su antagonista o fuerza opuesta, un conflicto central, y un tono narrativo. Crea las entidades con la información que tenga sentido — todo provisional, podemos cambiarlo después.')}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-left text-sm flex items-center gap-3"
              >
                <span className="text-2xl">🎲</span>
                <span>Proponme un borrador</span>
              </button>
              <button
                onClick={() => send('Tengo una idea que quiero desarrollar. Pregúntame primero por el protagonista o la imagen-semilla que tengo en la cabeza.')}
                className="w-full px-4 py-3 bg-white border-2 border-slate-300 text-slate-800 rounded-xl font-bold text-left text-sm flex items-center gap-3"
              >
                <span className="text-2xl">💡</span>
                <span>Yo tengo una idea</span>
              </button>
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const display = isUser ? m.content : stripBlocks(m.content);
          if (!display.trim() && !isUser && i === messages.length - 1 && streaming) {
            return (
              <div key={i} className="flex">
                <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-slate-500 shadow-sm flex items-center gap-1.5">
                  <span className="breathing-dot w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
                  <span className="breathing-dot w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
                  <span className="breathing-dot w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
                </div>
              </div>
            );
          }
          return (
            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                isUser ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white text-slate-900 rounded-bl-md border border-slate-200'
              }`}>
                <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
                  <ReactMarkdown>{display}</ReactMarkdown>
                </div>
              </div>
              {!isUser && m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[90%]">
                  {m.suggestions.map((rawS, j) => {
                    const s = typeof rawS === 'string' ? { question: rawS } : rawS;
                    return (
                      <button
                        key={j}
                        onClick={() => send(s.options && s.options.length > 0 ? `${s.question}\n\nOpciones disponibles: ${s.options.join(' / ')}` : s.question)}
                        disabled={streaming}
                        className="px-3 py-1.5 text-xs bg-white border-2 border-indigo-300 text-indigo-800 rounded-full font-semibold disabled:opacity-50"
                      >
                        → {s.question}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t-2 border-slate-200 bg-white p-2.5 safe-area">
        {applying && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full text-[11px] font-semibold w-fit animate-fade-in">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
            </span>
            <span>💾 Guardando cambios…</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="Habla con la IA…"
            rows={1}
            disabled={streaming}
            className="flex-1 px-3 py-2.5 text-base bg-slate-50 border-2 border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none min-h-12 max-h-40 disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="px-4 py-2.5 bg-indigo-600 disabled:opacity-50 text-white rounded-2xl text-sm font-bold min-h-12"
          >
            {streaming ? '…' : '→'}
          </button>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex" onClick={() => setDrawer(false)}>
          <div className="w-72 bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <header className="px-4 py-3 border-b-2 border-slate-200 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black flex items-center justify-center">S</div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-widest text-indigo-600 font-bold">Scruotia mobile</div>
                <div className="text-sm font-bold text-slate-900">{title}</div>
              </div>
              <button onClick={() => setDrawer(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center">✕</button>
            </header>
            <nav className="p-3 space-y-2">
              <Link href="/" className="block px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-semibold text-slate-800">📋 Proyectos</Link>
              <Link href={`/p/${slug}`} className="block px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm font-semibold text-slate-800">🖥️ Vista desktop</Link>
              <div className="pt-3 mt-3 border-t border-slate-100">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2">Tip</div>
                <p className="text-xs text-slate-600 leading-relaxed px-2 mt-1">
                  La vista mobile es solo el chat. Para ver la bible organizada (Story Pulse, cards, mapa cronológico), abre la vista desktop.
                </p>
              </div>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

function stripBlocks(text: string): string {
  let display = text
    .replace(/\n?~~~scruotia-status\n[\s\S]*?\n~~~\n?/g, '')
    .replace(/(?:^|\n)\s*~~~\s*scruotia-(?:card|patch|link|delete|fact|suggest)\b[\s\S]*?\n\s*~~~(?=\s*(?:\n|$))/g, '')
    .replace(/<{2,}\s*CARD\s*:\s*[^:/<>\n]+?\s*:\s*[^:/<>\n]+?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*PATCH\s*:\s*[^:/<>\n]+?\s*:\s*[^:/<>\n]+?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*LINK\s*:[^>]*?>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*DELETE\s*:[^>]*?>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*FACT\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*SUGGEST\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '');
  const openFence = display.search(/(?:^|\n)\s*~~~\s*scruotia-/);
  if (openFence !== -1 && !/\n\s*~~~\s*(?:\n|$)/.test(display.slice(openFence + 1))) {
    display = display.slice(0, openFence);
  }
  const open = display.search(/<{2,}\s*(CARD|PATCH|LINK|DELETE|FACT|SUGGEST)\b/);
  if (open !== -1 && !display.slice(open).match(/<{2,}\s*END\s*>{2,}/)) {
    display = display.slice(0, open);
  }
  return display.replace(/\n{3,}/g, '\n\n');
}
