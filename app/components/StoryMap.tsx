'use client';
import { useMemo, useState } from 'react';
import { parseBody, getField, mergeBody } from '@/lib/body-fields';
import type { Entity, EntityLink } from '@/lib/entities';

type Props = {
  slug: string;
  entities: Entity[];
  onEntityChanged: (entity: Entity) => void;
  onOpenEntity: (entity: Entity) => void;
};

const ACTS = [
  { id: 'setup',  label: 'Setup',       tone: 'emerald', hint: '0-25%' },
  { id: 'd1',     label: 'Disastro 1',  tone: 'amber',   hint: '25-40%' },
  { id: 'mid',    label: 'Midpoint',    tone: 'fuchsia', hint: '40-60%' },
  { id: 'd3',     label: 'Disastro 3',  tone: 'rose',    hint: '60-85%' },
  { id: 'final',  label: 'Resolución',  tone: 'indigo',  hint: '85-100%' },
] as const;
type ActId = typeof ACTS[number]['id'];

const ACT_TONE: Record<string, { bg: string; border: string; text: string }> = {
  emerald: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800' },
  amber:   { bg: 'bg-amber-100',   border: 'border-amber-300',   text: 'text-amber-800'   },
  fuchsia: { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', text: 'text-fuchsia-800' },
  rose:    { bg: 'bg-rose-100',    border: 'border-rose-300',    text: 'text-rose-800'    },
  indigo:  { bg: 'bg-indigo-100',  border: 'border-indigo-300',  text: 'text-indigo-800'  },
};

/**
 * Story Map — chronological view of the bible. 5 acts as columns, chapters
 * as cards, scenes as rows inside chapters. Drag a scene to move it to
 * another chapter; drop emits 3 PUTs (origin chapter, destination chapter,
 * scene itself) so the body bullets and the links stay coherent.
 *
 * Chapter→act assignment is heuristic when not explicit:
 *  - if body has `- **Acto:** setup|d1|mid|d3|final`, use it
 *  - else infer from `- **Número:** N` proportionally (N/total)
 *  - else dump into "Sin asignar" (a 6th lane shown if needed)
 *
 * Scene→chapter mapping reads the chapter's `- **Escenas:** slug1, slug2`
 * bullet — that's the canonical ordered list. As a fallback the scene's
 * `- **Capítulo:**` field or its `pertenece a` link is used.
 */
export default function StoryMap({ slug, entities, onEntityChanged, onOpenEntity }: Props) {
  void slug;
  const capitulos = useMemo(() => entities.filter(e => e.type === 'capitulo'), [entities]);
  const escenas = useMemo(() => entities.filter(e => e.type === 'escena'), [entities]);
  const [busy, setBusy] = useState<string | null>(null);

  // Chapter → act assignment
  const numbers = capitulos
    .map(c => parseInt(getField(parseBody(c.body), /^n[úu]mero$/i), 10))
    .filter(n => !isNaN(n));
  const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;

  function actForChapter(cap: Entity): ActId | 'unassigned' {
    const p = parseBody(cap.body);
    const explicit = getField(p, /^acto$/i).toLowerCase().trim();
    if (explicit) {
      const match = ACTS.find(a => a.id === explicit || a.label.toLowerCase() === explicit);
      if (match) return match.id;
    }
    const num = parseInt(getField(p, /^n[úu]mero$/i), 10);
    if (!isNaN(num) && maxNum > 0) {
      const ratio = num / maxNum;
      if (ratio <= 0.25) return 'setup';
      if (ratio <= 0.40) return 'd1';
      if (ratio <= 0.60) return 'mid';
      if (ratio <= 0.85) return 'd3';
      return 'final';
    }
    return 'unassigned';
  }

  // Group chapters by act, sorted by Número within each.
  const byAct = useMemo(() => {
    const groups = new Map<ActId | 'unassigned', Entity[]>();
    for (const c of capitulos) {
      const a = actForChapter(c);
      const arr = groups.get(a) ?? [];
      arr.push(c);
      groups.set(a, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => {
        const na = parseInt(getField(parseBody(a.body), /^n[úu]mero$/i), 10) || 0;
        const nb = parseInt(getField(parseBody(b.body), /^n[úu]mero$/i), 10) || 0;
        return na - nb;
      });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capitulos, maxNum]);

  // For each chapter, scenes in declared order.
  const escenasMap = useMemo(() => new Map(escenas.map(e => [e.slug, e])), [escenas]);
  function scenesOf(cap: Entity): Entity[] {
    const list = getField(parseBody(cap.body), /^escenas$/i)
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: Entity[] = [];
    for (const slugRef of list) {
      const e = escenasMap.get(slugRef);
      if (e && !seen.has(e.slug)) { out.push(e); seen.add(e.slug); }
    }
    // Append orphans whose link points to this chapter but aren't in the list.
    for (const e of escenas) {
      if (seen.has(e.slug)) continue;
      const linksTo = e.links.some(l => l.to === `capitulo/${cap.slug}`);
      const fieldRef = getField(parseBody(e.body), /cap[íi]tulo/i);
      if (linksTo || fieldRef === cap.name) {
        out.push(e);
        seen.add(e.slug);
      }
    }
    return out;
  }

  // ───── Drag and drop ─────
  // Use HTML5 native DnD. dragstart on a scene card, dragover on chapter
  // body, drop on chapter body → moveScene(...).

  async function putEntity(entity: Entity, body: string, links?: EntityLink[]): Promise<Entity> {
    const r = await fetch(`/api/projects/${slug}/entity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entity.type,
        slug: entity.slug,
        name: entity.name,
        icon: entity.icon,
        body,
        status: entity.status,
        links: links ?? entity.links,
      }),
    });
    if (!r.ok) throw new Error(`PUT ${entity.type}/${entity.slug} failed`);
    const data = await r.json();
    return data.entity as Entity;
  }

  function chapterOfScene(escenaSlug: string): Entity | null {
    for (const cap of capitulos) {
      const list = getField(parseBody(cap.body), /^escenas$/i)
        .split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      if (list.includes(escenaSlug)) return cap;
    }
    // Fallback: by link
    const escena = escenasMap.get(escenaSlug);
    if (!escena) return null;
    const targetSlug = escena.links.find(l => l.to.startsWith('capitulo/'))?.to.split('/')[1];
    return capitulos.find(c => c.slug === targetSlug) ?? null;
  }

  async function moveScene(escenaSlug: string, toCapSlug: string) {
    const escena = escenasMap.get(escenaSlug);
    const toCap = capitulos.find(c => c.slug === toCapSlug);
    if (!escena || !toCap) return;
    const fromCap = chapterOfScene(escenaSlug);
    if (fromCap?.slug === toCap.slug) return;

    setBusy(escenaSlug);
    try {
      // 1. Add to destination chapter's "Escenas" field.
      const toList = getField(parseBody(toCap.body), /^escenas$/i)
        .split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      if (!toList.includes(escenaSlug)) toList.push(escenaSlug);
      const toNewBody = mergeBody(toCap.body, { Escenas: toList.join(', ') });
      const updatedTo = await putEntity(toCap, toNewBody);
      onEntityChanged(updatedTo);

      // 2. Remove from origin chapter's "Escenas" field (if any).
      if (fromCap) {
        const fromList = getField(parseBody(fromCap.body), /^escenas$/i)
          .split(/[,\n]/).map(s => s.trim()).filter(Boolean)
          .filter(s => s !== escenaSlug);
        const fromNewBody = mergeBody(fromCap.body, { Escenas: fromList.join(', ') });
        const updatedFrom = await putEntity(fromCap, fromNewBody);
        onEntityChanged(updatedFrom);
      }

      // 3. Update scene's "Capítulo" field + links.
      const escenaNewBody = mergeBody(escena.body, { 'Capítulo': toCap.name });
      const newLinks: EntityLink[] = escena.links
        .filter(l => !l.to.startsWith('capitulo/'))
        .concat([{ to: `capitulo/${toCap.slug}`, label: 'pertenece a' }]);
      const updatedEscena = await putEntity(escena, escenaNewBody, newLinks);
      onEntityChanged(updatedEscena);
    } finally {
      setBusy(null);
    }
  }

  // ───── Rendering ─────
  const lanes: Array<{ id: ActId | 'unassigned'; label: string; tone?: string; hint?: string }> = ACTS.map(a => ({ ...a }));
  if ((byAct.get('unassigned')?.length ?? 0) > 0) {
    lanes.push({ id: 'unassigned', label: 'Sin asignar', tone: undefined, hint: 'capítulos sin número' });
  }

  const hasContent = capitulos.length > 0 || escenas.length > 0;
  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-center text-slate-500">
        <div className="max-w-md">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-base">Aún no hay capítulos ni escenas que pintar en el mapa.</p>
          <p className="text-sm mt-2 text-slate-400">
            En la fase <strong>Trama</strong>, la IA empezará a crear capítulos y escenas — aparecerán aquí distribuidos en actos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto bg-slate-50 p-5">
      <div className="flex items-center gap-3 mb-4 max-w-full">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-indigo-600 font-bold">Vista cronológica</div>
          <h2 className="text-xl font-bold text-slate-900">Story Map</h2>
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>🖱️ Arrastra una escena para moverla a otro capítulo.</span>
          {capitulos.length > 0 && (
            <span className="px-2 py-0.5 bg-slate-200 rounded font-mono">
              {capitulos.length} cap · {escenas.length} esc
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(220px, 1fr))`, minWidth: lanes.length * 220 }}>
        {lanes.map(act => {
          const list = byAct.get(act.id) ?? [];
          const tone = act.tone ? ACT_TONE[act.tone] : { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700' };
          return (
            <div key={act.id} className="flex flex-col min-h-[300px]">
              <div className={`text-center py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${tone.bg} ${tone.text} mb-2`}>
                {act.label}
                {act.hint && <div className="text-[10px] font-normal opacity-70 normal-case mt-0.5">{act.hint}</div>}
              </div>
              <div className="flex-1 space-y-2">
                {list.map(cap => (
                  <ChapterCard
                    key={cap.slug}
                    cap={cap}
                    scenes={scenesOf(cap)}
                    busy={busy}
                    onOpenEntity={onOpenEntity}
                    onMoveScene={moveScene}
                  />
                ))}
                {list.length === 0 && (
                  <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-3 text-center text-[11px] text-slate-400 min-h-[120px] flex items-center justify-center">
                    Sin capítulos en este acto
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChapterCard({
  cap, scenes, busy, onOpenEntity, onMoveScene,
}: {
  cap: Entity;
  scenes: Entity[];
  busy: string | null;
  onOpenEntity: (e: Entity) => void;
  onMoveScene: (escenaSlug: string, toCapSlug: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const p = parseBody(cap.body);
  const num = getField(p, /^n[úu]mero$/i);
  const pov = getField(p, /^pov/i);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const escenaSlug = e.dataTransfer.getData('text/scruotia-escena');
        if (escenaSlug) onMoveScene(escenaSlug, cap.slug);
      }}
      className={`bg-pink-50 border-2 rounded-xl p-3 transition ${dragOver ? 'border-pink-500 ring-4 ring-pink-200' : 'border-pink-200 hover:border-pink-300'}`}
    >
      <button
        onClick={() => onOpenEntity(cap)}
        className="w-full text-left mb-2"
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm">📖</span>
          {num && <span className="text-[10px] uppercase tracking-wider text-pink-700 font-bold">Cap. {num}</span>}
        </div>
        <div className="text-xs font-bold text-slate-900 leading-tight">{cap.name}</div>
        {pov && <div className="text-[10px] text-slate-500 italic mt-0.5">POV: {pov}</div>}
      </button>
      <div className="space-y-1">
        {scenes.map(s => (
          <SceneRow key={s.slug} escena={s} busy={busy === s.slug} onOpenEntity={onOpenEntity} />
        ))}
        {scenes.length === 0 && (
          <div className="text-[10px] text-pink-700/60 italic px-1 py-1.5 border border-dashed border-pink-300 rounded text-center">
            Suelta una escena aquí
          </div>
        )}
      </div>
    </div>
  );
}

function SceneRow({ escena, busy, onOpenEntity }: { escena: Entity; busy: boolean; onOpenEntity: (e: Entity) => void }) {
  const beat = getField(parseBody(escena.body), /^beat$/i);
  return (
    <div
      draggable={!busy}
      onDragStart={(e) => { e.dataTransfer.setData('text/scruotia-escena', escena.slug); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpenEntity(escena)}
      className={`bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[11px] text-slate-700 hover:border-indigo-300 transition flex items-center gap-1.5 ${busy ? 'opacity-50 cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
      title={`${escena.name}${beat ? ` · ${beat}` : ''}`}
    >
      <span>🎬</span>
      <span className="truncate flex-1">{escena.name}</span>
      {busy && <span className="text-[9px] text-indigo-600">…</span>}
    </div>
  );
}
