'use client';
import { useEffect, useState } from 'react';
import { getTypeDef } from '@/lib/entity-types';
import EntityCard from './EntityCard';
import HistoryDrawer from './HistoryDrawer';
import BranchExplorer from './BranchExplorer';
import type { Entity, EntityLink } from '@/lib/entities';

type Props = {
  slug: string;
  entity: Entity;
  entitiesById: Map<string, Entity>;
  onClose: () => void;
  onChange: (next: Entity) => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onAction: (prompt: string) => void;
};

const COLOR_BG: Record<string, string> = {
  indigo: 'from-indigo-100', emerald: 'from-emerald-100', amber: 'from-amber-100',
  rose: 'from-rose-100', pink: 'from-pink-100', red: 'from-red-100',
  violet: 'from-violet-100', cyan: 'from-cyan-100', orange: 'from-orange-100',
  sky: 'from-sky-100', slate: 'from-slate-100', yellow: 'from-yellow-100',
  fuchsia: 'from-fuchsia-100', teal: 'from-teal-100', lime: 'from-lime-100',
};

/**
 * Full-screen modal for any entity. Two view modes:
 *   "Vista" (default): pretty rendered body + quick AI actions.
 *   "Editar":          name input + markdown textarea + save.
 * Lock + delete live in the footer regardless of view.
 */
export default function EntityModal({
  slug, entity, entitiesById, onClose, onChange, onToggleLock, onDelete, onAction,
}: Props) {
  const def = getTypeDef(entity.type);
  const bg = COLOR_BG[def.color] ?? COLOR_BG.slate;

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draftName, setDraftName] = useState(entity.name);
  const [draftBody, setDraftBody] = useState(entity.body);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [branchExplorer, setBranchExplorer] = useState<{ fieldKey: string | null } | null>(null);

  useEffect(() => { setDraftName(entity.name); setDraftBody(entity.body); }, [entity.name, entity.body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && mode !== 'edit') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mode]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${slug}/entity`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: entity.type,
          slug: entity.slug,
          name: draftName,
          body: draftBody,
          icon: entity.icon,
          status: entity.status,
          links: entity.links,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        onChange(data.entity);
        setSavedFlash(true);
        setMode('view');
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * Inline manual patch — user typed a new value for one field. Calls
   * mergeBody server-side via the same PUT endpoint with the merged body
   * (computed on the client via /api/inline-ai/patch is overkill; we just
   * build the merged body here using a tiny POST helper that re-uses
   * mergeBody server-side and snapshots automatically).
   *
   * For simplicity, we PUT the full body computed client-side. mergeBody
   * lives in lib/body-fields.ts but is plain pure JS, so we can call it
   * straight from the client. Avoids round-trip.
   */
  async function inlinePatch(key: string, value: string) {
    // Lazy import to avoid bundling for the no-edit case.
    const { mergeBody } = await import('@/lib/body-fields');
    const newBody = mergeBody(entity.body, { [key]: value });
    const r = await fetch(`/api/projects/${slug}/entity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entity.type,
        slug: entity.slug,
        name: entity.name,
        body: newBody,
        icon: entity.icon,
        status: entity.status,
        links: entity.links,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      onChange(data.entity);
    }
  }

  /**
   * Inline AI patch — user clicked the ✨ button on a field. Calls the
   * scoped /api/inline-ai endpoint which is *not* part of the project
   * conversation, so the chat history stays clean.
   */
  async function inlineAskAI(key: string, instruction?: string) {
    setPendingField(key);
    try {
      const r = await fetch('/api/inline-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: slug,
          entityType: entity.type,
          entitySlug: entity.slug,
          fieldKey: key,
          instruction,
        }),
      });
      if (!r.ok) return;
      const data = await r.json();
      if (data?.ok && data.newBody) {
        // Refetch the full entity so the modal sees the new fields too.
        const re = await fetch(`/api/projects/${slug}/entity?type=${entity.type}&slug=${entity.slug}`);
        if (re.ok) {
          const ed = await re.json();
          if (ed.entity) onChange(ed.entity);
        }
      }
    } finally {
      setPendingField(null);
    }
  }

  function renderLinkChip(link: EntityLink, i: number) {
    const target = entitiesById.get(link.to);
    const label = target ? `${target.icon ?? '•'} ${target.name}` : link.to;
    return (
      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-slate-100 border border-slate-200 text-slate-800 rounded-md font-medium">
        {label}
        {link.label && <span className="text-slate-500 italic">· {link.label}</span>}
      </span>
    );
  }

  const isLocked = entity.status === 'locked';
  const dirty = draftName !== entity.name || draftBody !== entity.body;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && mode !== 'edit') onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <header className={`px-6 py-4 border-b-2 border-slate-200 bg-gradient-to-br ${bg} to-white flex items-center gap-3`}>
          <div className="text-3xl">{entity.icon ?? def.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">{def.label}</div>
            <h2 className="text-xl font-bold text-slate-900 truncate leading-tight">{entity.name}</h2>
          </div>
          {mode === 'view' ? (
            <button
              onClick={() => setMode('edit')}
              className="text-sm px-3 py-1.5 bg-white border-2 border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 rounded-lg font-semibold transition"
            >✏️ Editar</button>
          ) : (
            <button
              onClick={() => { setMode('view'); setDraftName(entity.name); setDraftBody(entity.body); }}
              className="text-sm px-3 py-1.5 bg-white border-2 border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 rounded-lg font-semibold transition"
            >← Vista</button>
          )}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center text-lg transition"
          >✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40">
          {mode === 'view' ? (
            <div className="space-y-4">
              {entity.body.trim() ? (
                <EntityCard
                  entity={entity}
                  onAction={onAction}
                  editable={isLocked ? undefined : {
                    onPatch: inlinePatch,
                    onAskAI: inlineAskAI,
                    onSketch: (k) => setBranchExplorer({ fieldKey: k }),
                    isPending: (k) => pendingField === k,
                  }}
                />
              ) : (
                <div className="text-sm text-slate-500 italic">
                  Esta tarjeta está vacía. Click ✏️ Editar para añadir contenido, o pídeselo a la IA debajo.
                </div>
              )}

              {entity.links.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Conectado con</div>
                  <div className="flex flex-wrap gap-1.5">
                    {entity.links.map(renderLinkChip)}
                  </div>
                </div>
              )}

              {!isLocked && (
                <div className="pt-4 border-t-2 border-slate-200">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">Pedir a la IA</div>
                  <div className="flex flex-wrap gap-2">
                    {quickActions(entity.type, entity.name).map(a => (
                      <button
                        key={a.label}
                        onClick={() => { onAction(a.prompt); onClose(); }}
                        className="px-3 py-1.5 text-sm bg-white border-2 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-800 hover:text-indigo-800 rounded-full font-semibold transition"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Nombre</span>
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-base bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Contenido (markdown)</span>
                <textarea
                  value={draftBody}
                  onChange={e => setDraftBody(e.target.value)}
                  rows={18}
                  className="w-full mt-1 px-3 py-2 text-sm bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 font-mono resize-y leading-relaxed"
                />
              </label>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t-2 border-slate-200 bg-white flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm(`¿Eliminar "${entity.name}"? La IA puede recrearla si la mencionas de nuevo.`)) {
                onDelete();
                onClose();
              }
            }}
            className="text-xs px-2.5 py-1.5 text-slate-500 hover:text-red-600 transition"
          >Eliminar</button>
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-xs px-2.5 py-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition font-semibold"
            title="Ver versiones anteriores de esta entidad"
          >⏪ Historial</button>
          {!isLocked && (
            <button
              onClick={() => setBranchExplorer({ fieldKey: null })}
              className="text-xs px-2.5 py-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition font-semibold"
              title="Explorar 3 versiones alternativas de la ficha entera"
            >🌿 Variantes</button>
          )}
          <div className="flex-1" />
          {savedFlash && <span className="text-xs text-green-600 font-semibold">✓ Guardado</span>}
          <button
            onClick={onToggleLock}
            className={`text-sm px-3 py-1.5 border-2 rounded-lg font-semibold transition ${
              isLocked
                ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isLocked ? '🔒 Bloqueada' : '🔓 Marcar como canon'}
          </button>
          {mode === 'edit' && (
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition shadow-sm"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </footer>
      </div>

      {historyOpen && (
        <HistoryDrawer
          slug={slug}
          entity={entity}
          onClose={() => setHistoryOpen(false)}
          onRestored={(next) => onChange(next)}
        />
      )}
      {branchExplorer && (
        <BranchExplorer
          slug={slug}
          entity={entity}
          fieldKey={branchExplorer.fieldKey}
          onClose={() => setBranchExplorer(null)}
          onApplied={(next) => onChange(next)}
        />
      )}
    </div>
  );
}

function quickActions(type: string, name: string): Array<{ label: string; prompt: string }> {
  if (type === 'personaje') return [
    { label: '✨ Profundizar', prompt: `Profundiza en "${name}" — añade detalles que falten en su ficha y emite la actualización completa.` },
    { label: '📜 Backstory', prompt: `Profundiza el backstory de "${name}": pasado relevante, traumas, eventos que lo modelaron.` },
    { label: '🎲 Variantes', prompt: `Propón 2-3 versiones alternativas de "${name}" con distintos arcos o motivaciones. NO sobrescribas la actual todavía.` },
    { label: '🎭 Voz', prompt: `Definamos cómo habla "${name}": registro, muletillas, qué tipo de cosas dice y no dice.` },
  ];
  if (type === 'escena') return [
    { label: '📝 Narrar', prompt: `Escribe un párrafo narrativo (sin diálogo) de la escena "${name}". Actualiza la card con el párrafo.` },
    { label: '🎲 Variantes', prompt: `Propón 2-3 maneras alternativas de jugar la escena "${name}".` },
  ];
  if (type === 'conflicto') return [
    { label: '🎲 Variantes', prompt: `Propón 2-3 versiones del conflicto "${name}" con distintos niveles de stakes.` },
    { label: '⚙️ Mecánica', prompt: `Profundiza cómo se manifiesta "${name}" escena a escena.` },
  ];
  if (type === 'lugar') return [
    { label: '🎨 Sensaciones', prompt: `Profundiza "${name}" con detalles sensoriales (sonidos, olores, texturas, luz).` },
    { label: '🔗 Quién va', prompt: `¿Qué personajes pasan por "${name}" y qué escenas ocurren allí?` },
  ];
  if (type === 'tono') return [
    { label: '🔊 Otra muestra', prompt: `Genera una muestra alternativa del tono — un párrafo de 3-6 frases que represente otra vía estilística posible, manteniendo persona y tiempo verbal.` },
    { label: '✨ Refinar', prompt: `Refina el tono — añade precisión sobre registro, ritmo y qué evitar.` },
  ];
  if (type === 'logline') return [
    { label: '🎲 Variantes', prompt: `Propón 2-3 loglines alternativas que digan lo mismo de manera distinta.` },
    { label: '✨ Más nítida', prompt: `Refina la logline — hazla más nítida y evocadora en ≤15 palabras.` },
  ];
  return [
    { label: '✨ Profundizar', prompt: `Profundiza "${name}" — añade detalles concretos que falten.` },
    { label: '🎲 Variantes', prompt: `Propón 2-3 versiones alternativas de "${name}".` },
  ];
}
