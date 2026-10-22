'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export type Suggestion = { question: string; options?: string[] };

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  focusArtifact?: string | null;
  suggestions?: Array<Suggestion | string>;
  touched?: string[];
};

function normalizeSuggestion(s: Suggestion | string): Suggestion {
  return typeof s === 'string' ? { question: s } : s;
}

export type EntityMeta = {
  id: string; // "type/slug"
  name: string;
  icon?: string;
  typeLabel: string;
};

export type QuickPrompt = { label: string; prompt: string };

type Props = {
  slug: string;
  initialMessages: ChatMessage[];
  entities: EntityMeta[];
  focusEntity: string | null;
  /** Coaching prompts derived from current entity state, shown as always-on chips above the input. */
  quickPrompts: QuickPrompt[];
  onFocusChange: (id: string | null) => void;
  onUpdatesApplied: (touched: string[], factsAdded: number, deletedIds: string[]) => void;
  /** Imperative handle so the canvas can drop a prompt straight into the chat. */
  registerSendHandle?: (handle: { send: (text: string) => void }) => void;
};

/**
 * Strip every protocol block (CARD / PATCH / LINK / DELETE / FACT / SUGGEST
 * / legacy DOC) from streaming text so the chat bubble never shows raw
 * markup. Tolerant to the model occasionally emitting "<<" instead of "<<<"
 * (or ">>" instead of ">>>"), and to whitespace, accents, or stray casing.
 */
function applyingSummary(c: { cards: number; patches: number; links: number; deletes: number; facts: number }): string {
  const parts: string[] = [];
  if (c.cards) parts.push(`${c.cards} card${c.cards === 1 ? '' : 's'}`);
  if (c.patches) parts.push(`${c.patches} patch${c.patches === 1 ? '' : 'es'}`);
  if (c.links) parts.push(`${c.links} link${c.links === 1 ? '' : 's'}`);
  if (c.deletes) parts.push(`${c.deletes} borrad${c.deletes === 1 ? 'a' : 'as'}`);
  if (c.facts) parts.push(`${c.facts} hecho${c.facts === 1 ? '' : 's'}`);
  return parts.length > 0 ? `· ${parts.join(' · ')}` : '';
}

function stripBlocks(text: string): string {
  let display = text
    // Status events injected by the server (applying / done / error).
    .replace(/\n?~~~skriptia-status\n[\s\S]*?\n~~~\n?/g, '')
    // Fenced protocol (preferred since v4).
    .replace(/(?:^|\n)\s*~~~\s*skriptia-(?:card|patch|link|delete|fact|suggest)\b[\s\S]*?\n\s*~~~(?=\s*(?:\n|$))/g, '')
    // Legacy <<<…>>> protocol (tolerant to 2+ chevrons).
    .replace(/<{2,}\s*CARD\s*:\s*[^:/<>\n]+?\s*:\s*[^:/<>\n]+?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*PATCH\s*:\s*[^:/<>\n]+?\s*:\s*[^:/<>\n]+?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*LINK\s*:\s*[^:/<>\n]+?\/[^:/<>\n]+?\s*:\s*[^:/<>\n]+?\/[^:/<>\n]+?(?:\s*:\s*[^<>]*?)?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*DELETE\s*:\s*[^:/<>\n]+?\s*\/\s*[^:/<>\n]+?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*FACT\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*SUGGEST\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '')
    .replace(/<{2,}\s*DOC(?:\s*:\s*[^<>]+?)?\s*>{2,}[\s\S]*?<{2,}\s*END\s*>{2,}/g, '');
  // While streaming, also hide a trailing unterminated block start so the
  // user never sees half a block. Both fence opener and legacy start.
  const openFence = display.search(/(?:^|\n)\s*~~~\s*skriptia-/);
  if (openFence !== -1 && !/\n\s*~~~\s*(?:\n|$)/.test(display.slice(openFence + 1))) {
    display = display.slice(0, openFence);
  }
  const openLegacy = display.search(/<{2,}\s*(CARD|PATCH|LINK|DELETE|FACT|SUGGEST|DOC)\b/);
  if (openLegacy !== -1 && !display.slice(openLegacy).match(/<{2,}\s*END\s*>{2,}/)) {
    display = display.slice(0, openLegacy);
  }
  return display.replace(/\n{3,}/g, '\n\n');
}

export default function ChatColumn({
  slug, initialMessages, entities, focusEntity, quickPrompts, onFocusChange, onUpdatesApplied, registerSendHandle,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [applying, setApplying] = useState<{ cards: number; patches: number; links: number; deletes: number; facts: number } | null>(null);
  const [pills, setPills] = useState<{ created: string[]; updated: string[]; deleted: string[]; facts: number } | null>(null);
  const [openChooser, setOpenChooser] = useState<Suggestion | null>(null);
  const [chooserCustom, setChooserCustom] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Expose imperative send so the canvas can fire suggestion prompts.
  useEffect(() => {
    registerSendHandle?.({ send: (text: string) => send(text) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSendHandle, slug, focusEntity, streaming, entities, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { if (!streaming) inputRef.current?.focus(); }, [streaming]);

  useEffect(() => {
    if (!pills) return;
    const t = setTimeout(() => setPills(null), 5500);
    return () => clearTimeout(t);
  }, [pills]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const userMsg: ChatMessage = { role: 'user', content: trimmed, focusArtifact: focusEntity };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);
    setMessages(m => [...m, { role: 'assistant', content: '' }]);

    const knownEntityIds = new Set(entities.map(e => e.id));

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectSlug: slug,
        mode: 'project',
        messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        focusEntity,
      }),
    });

    if (!res.body) { setStreaming(false); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    // Status events injected by the server: ~~~skriptia-status\n{json}\n~~~
    // When we see "applying" we free the input so the user can type the next
    // turn while disk writes finish. When we see "done" we pop the success
    // pills with the real touched ids.
    const STATUS_RE = /\n?~~~skriptia-status\n([\s\S]*?)\n~~~\n?/g;
    let serverTouched: string[] = [];
    let serverDeletes: string[] = [];
    let serverFacts = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });

      // Drain any status markers that arrived in this chunk and act on them.
      // `deletes` is a count during 'applying' and a string[] during 'done',
      // so we type it loosely and discriminate by phase.
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
            // Free the input early — server is still writing to disk but the
            // prose is done.
            setStreaming(false);
          } else if (ev.phase === 'done') {
            serverTouched = Array.isArray(ev.touched) ? (ev.touched as string[]) : [];
            serverDeletes = Array.isArray(ev.deletes) ? (ev.deletes as string[]) : [];
            serverFacts = typeof ev.facts === 'number' ? ev.facts : 0;
            setApplying(null);
          }
        } catch {/* ignore malformed */}
      }

      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: acc };
        return copy;
      });
    }
    setStreaming(false);
    setApplying(null);

    // Parse blocks from final assistant text. Use tolerant matchers
    // consistent with extractEntityUpdates() (whitespace + accents allowed).
    const cardMatches = [...acc.matchAll(/<{2,}\s*CARD\s*:\s*([^:/<>\n]+?)\s*:\s*([^:/<>\n]+?)\s*>{2,}/g)];
    const patchMatches = [...acc.matchAll(/<{2,}\s*PATCH\s*:\s*([^:/<>\n]+?)\s*:\s*([^:/<>\n]+?)\s*>{2,}/g)];
    const fenceMatches = [...acc.matchAll(/(?:^|\n)\s*~~~\s*skriptia-(card|patch)\s+([^:\s]+?)\s*:\s*([^\s\n]+)/g)];
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const touched = Array.from(new Set([
      ...cardMatches.map(m => `${normalize(m[1])}/${normalize(m[2])}`),
      ...patchMatches.map(m => `${normalize(m[1])}/${normalize(m[2])}`),
      ...fenceMatches.map(m => `${normalize(m[2])}/${normalize(m[3])}`),
    ].filter(s => s !== '/')));
    const deletes = Array.from(new Set([
      ...[...acc.matchAll(/<{2,}\s*DELETE\s*:\s*([^:/<>\n]+?)\s*\/\s*([^:/<>\n]+?)\s*>{2,}/g)].map(m => `${normalize(m[1])}/${normalize(m[2])}`),
      ...[...acc.matchAll(/(?:^|\n)\s*~~~\s*skriptia-delete\s+([^/\s]+)\/([^\s\n]+)/g)].map(m => `${normalize(m[1])}/${normalize(m[2])}`),
    ].filter(s => s !== '/')));
    const factCount = [...acc.matchAll(/<{2,}\s*FACT\s*>{2,}/g)].length
      + [...acc.matchAll(/(?:^|\n)\s*~~~\s*skriptia-fact\b/g)].length;
    const legacySuggestions = [...acc.matchAll(/<{2,}\s*SUGGEST\s*>{2,}([\s\S]*?)<{2,}\s*END\s*>{2,}/g)];
    const fenceSuggestions = [...acc.matchAll(/(?:^|\n)\s*~~~\s*skriptia-suggest\b[^\n]*\n([\s\S]*?)\n\s*~~~/g)];
    const suggestionList: Suggestion[] = [...legacySuggestions, ...fenceSuggestions]
      .map(m => m[1].trim())
      .filter(Boolean)
      .map(raw => {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const qLines: string[] = [];
        const opts: string[] = [];
        for (const line of lines) {
          const bm = line.match(/^[-*•]\s+(.+)$/);
          if (bm) opts.push(bm[1].trim());
          else if (opts.length === 0) qLines.push(line);
        }
        return { question: qLines.join(' ').trim(), options: opts.length > 0 ? opts : undefined };
      })
      .filter(s => s.question);

    // Attach suggestions + touched to the rendered last assistant message so
    // the buttons appear inline and survive across page reloads (the server
    // persists them on the saved message).
    if (suggestionList.length > 0 || touched.length > 0) {
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            suggestions: suggestionList.length > 0 ? suggestionList : last.suggestions,
            touched: touched.length > 0 ? touched : last.touched,
          };
        }
        return copy;
      });
    }

    // Prefer the server's authoritative touched/deletes/facts when present
    // (they reflect what was actually written to disk). Fall back to regex
    // inference if the server didn't send a done event for some reason.
    const finalTouched = serverTouched.length > 0 ? serverTouched : touched;
    const finalDeletes = serverDeletes.length > 0 ? serverDeletes : deletes;
    const finalFacts = serverFacts > 0 ? serverFacts : factCount;
    if (finalTouched.length > 0 || finalDeletes.length > 0 || finalFacts > 0) {
      const created = finalTouched.filter(id => !knownEntityIds.has(id));
      const updated = finalTouched.filter(id => knownEntityIds.has(id));
      setPills({ created, updated, deleted: finalDeletes, facts: finalFacts });
      onUpdatesApplied(finalTouched, finalFacts, finalDeletes);
    }
  }

  function handleSuggestionClick(s: Suggestion) {
    if (s.options && s.options.length > 0) {
      setOpenChooser(s);
      setChooserCustom('');
      setTimeout(() => customInputRef.current?.focus(), 0);
    } else {
      send(s.question);
    }
  }

  function sendFromChooser(answer: string) {
    if (!answer.trim()) return;
    setOpenChooser(null);
    setChooserCustom('');
    send(answer);
  }

  const focusedEntity = focusEntity ? entities.find(e => e.id === focusEntity) : null;
  const isEmpty = messages.length === 0;

  function renderPills() {
    if (!pills) return null;
    const idToLabel = (id: string) => {
      const e = entities.find(x => x.id === id);
      return e ? `${e.icon ?? '•'} ${e.name}` : id;
    };
    const parts: string[] = [];
    if (pills.created.length) parts.push(`+${pills.created.length} ${pills.created.length === 1 ? 'nueva' : 'nuevas'}: ${pills.created.map(idToLabel).join(', ')}`);
    if (pills.updated.length) parts.push(`actualizadas: ${pills.updated.map(idToLabel).join(', ')}`);
    if (pills.deleted.length) parts.push(`-${pills.deleted.length} eliminadas`);
    if (pills.facts) parts.push(`+${pills.facts} ${pills.facts === 1 ? 'hecho canónico' : 'hechos canónicos'}`);
    return (
      <div className="absolute -top-14 left-4 right-4 flex justify-center pointer-events-none">
        <div className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-full shadow-xl animate-fade-in flex items-center gap-2 max-w-full border-2 border-emerald-500">
          <span className="text-base">✓</span>
          <span className="truncate">{parts.join(' · ')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {isEmpty && (
          <div className="max-w-2xl mx-auto py-16 text-center">
            <div className="text-6xl mb-4">📖</div>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Empecemos tu historia</h2>
            <p className="text-base text-slate-700 mb-8 leading-relaxed">
              Estás en <strong>fase 1: la semilla</strong>. Vamos a aterrizar
              el protagonista, el conflicto y el tono. Lo demás (escenas,
              mundo, capítulos) vendrá después.
            </p>
            <div className="space-y-3 max-w-md mx-auto">
              <button
                onClick={() => send('Proponme un borrador inicial de esta historia: un protagonista posible, su antagonista o fuerza opuesta, un conflicto central, y un tono narrativo. Crea las entidades (logline, personaje, conflicto, tono) con la información que tenga sentido — todo provisional, podemos cambiarlo después. Termina ofreciéndome opciones para modificar o reemplazar lo que no te encaje.')}
                className="w-full px-5 py-4 text-base bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md font-bold text-left flex items-start gap-3"
              >
                <span className="text-2xl">🎲</span>
                <span>
                  <span className="block">Proponme un borrador</span>
                  <span className="block text-xs font-normal opacity-90 mt-0.5">
                    La IA inventa una primera versión que tú vas modificando.
                  </span>
                </span>
              </button>
              <button
                onClick={() => send('Tengo una idea que quiero desarrollar. Pregúntame primero por el protagonista o la imagen-semilla que tengo en la cabeza, sin proponerme nada todavía.')}
                className="w-full px-5 py-4 text-base bg-white hover:bg-slate-50 text-slate-800 rounded-xl transition border-2 border-slate-300 hover:border-slate-400 shadow-sm font-bold text-left flex items-start gap-3"
              >
                <span className="text-2xl">💡</span>
                <span>
                  <span className="block">Yo tengo una idea</span>
                  <span className="block text-xs font-normal text-slate-600 mt-0.5">
                    Te pregunta por lo que ya tienes en la cabeza.
                  </span>
                </span>
              </button>
              <button
                onClick={() => send('Quiero arrancar por el mundo y el tono antes que por la trama. Pregúntame qué imagen, sensación o universo quiero contar.')}
                className="w-full px-5 py-4 text-base bg-white hover:bg-slate-50 text-slate-800 rounded-xl transition border-2 border-slate-300 hover:border-slate-400 shadow-sm font-bold text-left flex items-start gap-3"
              >
                <span className="text-2xl">🌍</span>
                <span>
                  <span className="block">Arranco por el mundo / tono</span>
                  <span className="block text-xs font-normal text-slate-600 mt-0.5">
                    Antes de personajes y trama, definir atmósfera.
                  </span>
                </span>
              </button>
            </div>
            <p className="mt-8 text-xs text-slate-500">
              O escribe directamente abajo lo que se te ocurra.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const display = isUser ? m.content : stripBlocks(m.content);
          if (!display.trim() && !isUser && i === messages.length - 1 && streaming) {
            return (
              <div key={i} className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-white border-2 border-slate-200 text-slate-500 shadow-sm flex items-center gap-1.5">
                  <span className="breathing-dot w-2 h-2 bg-indigo-500 rounded-full inline-block" />
                  <span className="breathing-dot w-2 h-2 bg-indigo-500 rounded-full inline-block" />
                  <span className="breathing-dot w-2 h-2 bg-indigo-500 rounded-full inline-block" />
                </div>
              </div>
            );
          }
          return (
            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                isUser
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-white text-slate-900 rounded-bl-md border-2 border-slate-200'
              }`}>
                <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : ''}`}>
                  <ReactMarkdown>{display}</ReactMarkdown>
                </div>
              </div>
              {!isUser && m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2 max-w-[80%] animate-fade-in">
                  {m.suggestions.map((rawS, j) => {
                    const s = normalizeSuggestion(rawS);
                    const hasOptions = Boolean(s.options && s.options.length > 0);
                    return (
                      <button
                        key={j}
                        onClick={() => handleSuggestionClick(s)}
                        disabled={streaming}
                        className="group px-3.5 py-2 text-sm bg-white border-2 border-indigo-300 text-indigo-800 hover:bg-indigo-50 hover:border-indigo-500 disabled:opacity-50 rounded-full font-semibold transition shadow-sm flex items-center gap-2"
                        title={hasOptions ? `Click para elegir entre ${s.options!.length} opciones o escribir tu propia respuesta` : 'Click para responder'}
                      >
                        <span>→ {s.question}</span>
                        {hasOptions && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 group-hover:bg-indigo-200 text-indigo-800 rounded-full font-bold">
                            {s.options!.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!isUser && m.touched && m.touched.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[80%]">
                  {m.touched.map((id, j) => {
                    const e = entities.find(x => x.id === id);
                    if (!e) return null;
                    return (
                      <button
                        key={j}
                        onClick={() => onFocusChange(id)}
                        className="text-xs px-2 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 hover:bg-emerald-200 hover:border-emerald-400 rounded-full font-semibold transition"
                        title="Saltar a esta tarjeta"
                      >
                        {e.icon ?? '•'} {e.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t-2 border-slate-200 bg-slate-50 backdrop-blur p-4 relative">
        {renderPills()}

        {applying && (
          <div className="mb-2.5 flex items-center gap-2 text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border-2 border-indigo-200 text-indigo-800 rounded-full font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              <span>💾 Aplicando cambios</span>
              <span className="text-indigo-600 font-mono text-[10px]">
                {applyingSummary(applying)}
              </span>
            </div>
            <span className="text-slate-500 text-[11px]">Ya puedes escribir el siguiente mensaje.</span>
          </div>
        )}

        {openChooser && (
          <div className="mb-3 p-4 bg-white border-2 border-indigo-300 rounded-xl shadow-md animate-fade-in">
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1 text-base font-bold text-slate-900 leading-snug">
                {openChooser.question}
              </div>
              <button
                onClick={() => { setOpenChooser(null); setChooserCustom(''); }}
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded w-6 h-6 flex items-center justify-center text-sm"
                title="Cancelar"
              >✕</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {openChooser.options!.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => sendFromChooser(opt)}
                  disabled={streaming}
                  className="px-3.5 py-2 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-900 disabled:opacity-50 rounded-full font-semibold transition border-2 border-indigo-200 hover:border-indigo-400"
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                ref={customInputRef}
                value={chooserCustom}
                onChange={e => setChooserCustom(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && chooserCustom.trim()) {
                    e.preventDefault();
                    sendFromChooser(chooserCustom);
                  }
                  if (e.key === 'Escape') {
                    setOpenChooser(null);
                    setChooserCustom('');
                  }
                }}
                placeholder="…o escribe tu propia respuesta"
                disabled={streaming}
                className="flex-1 px-3 py-2 text-sm bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
              <button
                onClick={() => sendFromChooser(chooserCustom)}
                disabled={streaming || !chooserCustom.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg font-semibold transition shadow-sm"
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        {!isEmpty && quickPrompts.length > 0 && !openChooser && (
          <div className="mb-2.5 flex flex-wrap gap-2 max-h-20 overflow-y-auto">
            {quickPrompts.slice(0, 4).map(qp => (
              <button
                key={qp.label}
                onClick={() => send(qp.prompt)}
                disabled={streaming}
                className="px-3 py-1.5 text-xs bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 rounded-full transition border border-slate-300 hover:border-slate-400 font-semibold shadow-sm"
                title={qp.prompt}
              >
                {qp.label}
              </button>
            ))}
          </div>
        )}

        {focusedEntity && (
          <div className="mb-2.5 flex items-center gap-2 text-sm">
            <span className="px-2.5 py-1 bg-indigo-100 border border-indigo-300 text-indigo-900 rounded-full font-semibold">
              Foco: {focusedEntity.icon ?? '•'} {focusedEntity.name}
            </span>
            <button
              onClick={() => onFocusChange(null)}
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded w-6 h-6 flex items-center justify-center text-xs"
              title="Quitar foco"
            >✕</button>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={focusedEntity ? `Habla sobre "${focusedEntity.name}"…` : 'Habla con la IA sobre tu historia…'}
            rows={2}
            disabled={streaming}
            className="flex-1 px-3.5 py-2.5 text-[15px] bg-white border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-y min-h-12 max-h-50 disabled:opacity-60 placeholder:text-slate-400"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition shadow-sm"
          >
            {streaming ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
