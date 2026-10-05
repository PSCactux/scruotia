'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ChatColumn, { type ChatMessage, type EntityMeta } from '@/app/components/ChatColumn';
import NarrativeCanvas from '@/app/components/NarrativeCanvas';
import EntityModal from '@/app/components/EntityModal';
import FactsModal from '@/app/components/FactsModal';
import ReferencesModal from '@/app/components/ReferencesModal';
import ValidationReport from '@/app/components/ValidationReport';
import StoryPulse from '@/app/components/StoryPulse';
import StoryMap from '@/app/components/StoryMap';
import PreviewModal from '@/app/components/PreviewModal';
import { getTypeDef } from '@/lib/entity-types';
import { computeSuggestions } from '@/lib/coaching';
import { computePulse } from '@/lib/pulse';
import type { Entity } from '@/lib/entities';

type Props = {
  slug: string;
  title: string;
  initialEntities: Entity[];
  initialMessages: ChatMessage[];
};

export default function ProjectClient({
  slug, title, initialEntities, initialMessages,
}: Props) {
  const [entities, setEntities] = useState<Entity[]>(initialEntities);
  const [focusEntity, setFocusEntity] = useState<string | null>(null);
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());
  const [factsOpen, setFactsOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validateReport, setValidateReport] = useState('');
  const [validating, setValidating] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [view, setView] = useState<'canvas' | 'map'>('canvas');
  // Counter of changes that happened while the canvas was closed — surfaces a
  // small badge on the peek button so the user knows something's new.
  const [unseenChanges, setUnseenChanges] = useState(0);
  const [openModalEntity, setOpenModalEntity] = useState<Entity | null>(null);
  const sendHandle = useRef<{ send: (text: string) => void } | null>(null);

  // Keep the modal's entity in sync if it got updated externally (e.g. AI
  // edited it via chat while the modal was open).
  useEffect(() => {
    if (!openModalEntity) return;
    const key = `${openModalEntity.type}/${openModalEntity.slug}`;
    const fresh = entities.find(e => `${e.type}/${e.slug}` === key);
    if (fresh && fresh !== openModalEntity) setOpenModalEntity(fresh);
    else if (!fresh) setOpenModalEntity(null); // got deleted
  }, [entities, openModalEntity]);

  const entitiesById = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities) m.set(`${e.type}/${e.slug}`, e);
    return m;
  }, [entities]);

  async function refreshEntities() {
    try {
      const r = await fetch(`/api/projects/${slug}/graph`, { cache: 'no-store' });
      const data = await r.json();
      setEntities(data.entities ?? []);
    } catch {/* ignore */}
  }

  function flashPulse(ids: string[]) {
    if (ids.length === 0) return;
    setPulsingIds(new Set(ids));
    setTimeout(() => setPulsingIds(new Set()), 1800);
  }

  async function handleUpdatesApplied(touched: string[], factsAdded: number, deletedIds: string[]) {
    void factsAdded; void deletedIds;
    await refreshEntities();
    flashPulse(touched);
    // If the bible is hidden, count how many changes the user hasn't seen.
    if (!canvasOpen) setUnseenChanges(n => n + touched.length + deletedIds.length);
  }

  function toggleCanvas() {
    setCanvasOpen(o => {
      if (!o) setUnseenChanges(0); // opening clears the unseen badge
      return !o;
    });
  }

  function handleEntityChange(next: Entity) {
    setEntities(curr => {
      const key = `${next.type}/${next.slug}`;
      const found = curr.find(e => `${e.type}/${e.slug}` === key);
      if (found) return curr.map(e => `${e.type}/${e.slug}` === key ? next : e);
      return [...curr, next];
    });
  }

  function handleEntityDelete(e: Entity) {
    const key = `${e.type}/${e.slug}`;
    setEntities(curr => curr.filter(x => `${x.type}/${x.slug}` !== key));
    if (focusEntity === key) setFocusEntity(null);
  }

  async function handleToggleLock(entity: Entity) {
    const next = entity.status === 'locked' ? 'drafting' : 'locked';
    const r = await fetch(`/api/projects/${slug}/entity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entity.type,
        slug: entity.slug,
        name: entity.name,
        body: entity.body,
        icon: entity.icon,
        status: next,
        links: entity.links,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      handleEntityChange(data.entity);
    }
  }

  async function runValidate() {
    setValidateOpen(true);
    setValidateReport('');
    setValidating(true);
    try {
      const r = await fetch(`/api/projects/${slug}/validate`, { method: 'POST' });
      if (!r.body) { setValidating(false); return; }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setValidateReport(acc);
      }
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusEntity && !factsOpen && !refsOpen && !validateOpen) {
        setFocusEntity(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusEntity, factsOpen, refsOpen, validateOpen]);

  const entityMetas: EntityMeta[] = entities.map(e => ({
    id: `${e.type}/${e.slug}`,
    name: e.name,
    icon: e.icon,
    typeLabel: getTypeDef(e.type).label,
  }));

  const quickPrompts = useMemo(() => computeSuggestions(entities), [entities]);
  const pulse = useMemo(() => computePulse(entities), [entities]);
  const hasCronologia = useMemo(() => entities.some(e => e.type === 'capitulo' || e.type === 'escena'), [entities]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="px-6 py-3 border-b-2 border-slate-200 bg-white flex items-center gap-4 shadow-sm">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-indigo-600 font-bold">Bible viva</div>
          <h1 className="text-xl font-bold text-slate-900 truncate leading-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {hasCronologia && (
            <div className="flex items-center bg-slate-100 border-2 border-slate-300 rounded-lg overflow-hidden text-sm font-semibold mr-1">
              <button
                onClick={() => setView('canvas')}
                className={`px-3 py-2 transition ${view === 'canvas' ? 'bg-white text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}
                title="Vista narrativa (Quién/Dónde/Qué pasa)"
              >📖 Bible</button>
              <button
                onClick={() => setView('map')}
                className={`px-3 py-2 transition ${view === 'map' ? 'bg-white text-indigo-700' : 'text-slate-600 hover:bg-slate-200'}`}
                title="Vista cronológica (5 actos · capítulos · escenas)"
              >🗺️ Mapa</button>
            </div>
          )}
          <button onClick={() => setFactsOpen(true)} className="text-sm px-3 py-2 bg-white border-2 border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 rounded-lg font-semibold transition" title="Hechos canónicos — verdad inviolable inyectada en cada chat">📌 Hechos</button>
          <button onClick={() => setRefsOpen(true)} className="text-sm px-3 py-2 bg-white border-2 border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 rounded-lg font-semibold transition" title="Gestionar referencias de estilo">📚 Referencias</button>
          <button onClick={runValidate} disabled={validating} className="text-sm px-3 py-2 bg-white border-2 border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 rounded-lg font-semibold transition" title="Auditar coherencia">{validating ? '🔍 Auditando…' : '🔍 Validar'}</button>
          <button onClick={() => setPreviewOpen(true)} className="text-sm px-3 py-2 bg-white border-2 border-amber-300 text-amber-800 hover:bg-amber-50 rounded-lg font-semibold transition" title="Ver cómo se vería la primera página con tu bible actual">👀 Preview</button>
          <a href={`/api/projects/${slug}/export`} download className="text-sm px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-600 rounded-lg font-semibold transition shadow-sm" title="Descargar bundle para Fase 2">📦 Exportar</a>
          <div className="w-px h-7 bg-slate-300 mx-1" />
          <button
            onClick={toggleCanvas}
            className={`text-sm px-3 py-2 border-2 rounded-lg font-semibold transition shadow-sm ${
              canvasOpen
                ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                : 'bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50'
            }`}
            title={canvasOpen ? 'Esconder la bible para concentrarte en la conversación' : 'Mostrar la bible'}
          >
            {canvasOpen ? '⇥ Ocultar bible' : '⇤ Mostrar bible'}
          </button>
        </div>
      </header>

      <StoryPulse
        pulse={pulse}
        onAction={(prompt) => sendHandle.current?.send(prompt)}
        onFocus={(id) => setFocusEntity(id)}
      />

      <div className="flex-1 flex min-h-0 relative">
        <ChatColumn
          slug={slug}
          initialMessages={initialMessages}
          entities={entityMetas}
          focusEntity={focusEntity}
          quickPrompts={quickPrompts}
          onFocusChange={setFocusEntity}
          onUpdatesApplied={handleUpdatesApplied}
          registerSendHandle={(h) => { sendHandle.current = h; }}
        />
        {canvasOpen && view === 'canvas' && (
          <NarrativeCanvas
            slug={slug}
            projectTitle={title}
            entities={entities}
            focusEntity={focusEntity}
            pulsingIds={pulsingIds}
            onFocus={setFocusEntity}
            onOpenEntity={(e) => setOpenModalEntity(e)}
            onSuggestion={(prompt) => sendHandle.current?.send(prompt)}
          />
        )}
        {canvasOpen && view === 'map' && (
          <StoryMap
            slug={slug}
            entities={entities}
            onEntityChanged={handleEntityChange}
            onOpenEntity={(e) => setOpenModalEntity(e)}
          />
        )}
        {/* Floating peek button — appears when canvas is hidden, with unseen
            changes badge so the user notices the AI updated something. */}
        {!canvasOpen && (
          <button
            onClick={toggleCanvas}
            className="absolute right-4 bottom-32 z-10 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-full shadow-xl border-2 border-indigo-500 flex items-center gap-2 transition"
            title="Mostrar la bible"
          >
            <span className="text-base">📋</span>
            <span>Bible · {entities.length}</span>
            {unseenChanges > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] rounded-full font-bold animate-pulse-once">
                +{unseenChanges}
              </span>
            )}
          </button>
        )}
      </div>

      {openModalEntity && (
        <EntityModal
          slug={slug}
          entity={openModalEntity}
          entitiesById={entitiesById}
          onClose={() => setOpenModalEntity(null)}
          onChange={handleEntityChange}
          onToggleLock={() => handleToggleLock(openModalEntity)}
          onDelete={() => handleEntityDelete(openModalEntity)}
          onAction={(prompt) => sendHandle.current?.send(prompt)}
        />
      )}
      {factsOpen && <FactsModal slug={slug} onClose={() => setFactsOpen(false)} />}
      {refsOpen && <ReferencesModal slug={slug} onClose={() => setRefsOpen(false)} />}
      {previewOpen && <PreviewModal slug={slug} onClose={() => setPreviewOpen(false)} />}
      {validateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={(e) => { if (e.target === e.currentTarget) setValidateOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
            <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Auditoría de coherencia</h2>
              <button onClick={() => setValidateOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition">✕</button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
              <ValidationReport markdown={validateReport} streaming={validating} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
