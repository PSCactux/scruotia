'use client';
import { useMemo, useState } from 'react';
import { extractEssence, extractRole, liveSummary, extractBeats, prosePreview } from '@/lib/narrative';
import { phaseProgress, currentPhase, PHASES, type PhaseId } from '@/lib/phases';
import { getTypeDef } from '@/lib/entity-types';
import type { Entity } from '@/lib/entities';

type Props = {
  slug: string;
  projectTitle: string;
  entities: Entity[];
  focusEntity: string | null;
  pulsingIds: Set<string>;
  onFocus: (id: string | null) => void;
  onOpenEntity: (entity: Entity) => void;
  onSuggestion: (prompt: string) => void;
};

function colorClasses(color: string) {
  const map: Record<string, { bg: string; border: string; text: string; ring: string }> = {
    indigo:   { bg: 'bg-indigo-100',   border: 'border-indigo-300',   text: 'text-indigo-900',   ring: 'ring-indigo-200'  },
    emerald:  { bg: 'bg-emerald-100',  border: 'border-emerald-300',  text: 'text-emerald-900',  ring: 'ring-emerald-200' },
    amber:    { bg: 'bg-amber-100',    border: 'border-amber-300',    text: 'text-amber-900',    ring: 'ring-amber-200'   },
    rose:     { bg: 'bg-rose-100',     border: 'border-rose-300',     text: 'text-rose-900',     ring: 'ring-rose-200'    },
    pink:     { bg: 'bg-pink-100',     border: 'border-pink-300',     text: 'text-pink-900',     ring: 'ring-pink-200'    },
    red:      { bg: 'bg-red-100',      border: 'border-red-300',      text: 'text-red-900',      ring: 'ring-red-200'     },
    violet:   { bg: 'bg-violet-100',   border: 'border-violet-300',   text: 'text-violet-900',   ring: 'ring-violet-200'  },
    cyan:     { bg: 'bg-cyan-100',     border: 'border-cyan-300',     text: 'text-cyan-900',     ring: 'ring-cyan-200'    },
    orange:   { bg: 'bg-orange-100',   border: 'border-orange-300',   text: 'text-orange-900',   ring: 'ring-orange-200'  },
    sky:      { bg: 'bg-sky-100',      border: 'border-sky-300',      text: 'text-sky-900',      ring: 'ring-sky-200'     },
    slate:    { bg: 'bg-slate-100',    border: 'border-slate-300',    text: 'text-slate-900',    ring: 'ring-slate-200'   },
    yellow:   { bg: 'bg-yellow-100',   border: 'border-yellow-300',   text: 'text-yellow-900',   ring: 'ring-yellow-200'  },
    fuchsia:  { bg: 'bg-fuchsia-100',  border: 'border-fuchsia-300',  text: 'text-fuchsia-900',  ring: 'ring-fuchsia-200' },
    teal:     { bg: 'bg-teal-100',     border: 'border-teal-300',     text: 'text-teal-900',     ring: 'ring-teal-200'    },
    lime:     { bg: 'bg-lime-100',     border: 'border-lime-300',     text: 'text-lime-900',     ring: 'ring-lime-200'    },
  };
  return map[color] ?? map.slate;
}

/** Extract the "## Muestra" block from a tono body, if present. */
function extractToneSample(tono: Entity | undefined): string | null {
  if (!tono) return null;
  const m = tono.body.match(/##\s*Muestra\s*\n([\s\S]*?)(?:\n##|$)/);
  if (!m) return null;
  const txt = m[1].trim();
  if (!txt || /^\(.*\)$/.test(txt)) return null;
  return txt;
}

export default function NarrativeCanvas({
  slug, projectTitle, entities, focusEntity, pulsingIds, onFocus, onOpenEntity, onSuggestion,
}: Props) {
  void slug; void focusEntity;
  const [moreOpen, setMoreOpen] = useState(false);

  const personajes = useMemo(() => entities.filter(e => e.type === 'personaje'), [entities]);
  const lugares = useMemo(() => entities.filter(e => e.type === 'lugar'), [entities]);
  const mundo = useMemo(() => entities.find(e => e.type === 'mundo'), [entities]);
  const sinopsis = useMemo(() => entities.find(e => e.type === 'sinopsis'), [entities]);
  const estructura = useMemo(() => entities.find(e => e.type === 'estructura'), [entities]);
  const tono = useMemo(() => entities.find(e => e.type === 'tono'), [entities]);
  const logline = useMemo(() => entities.find(e => e.type === 'logline'), [entities]);
  const escenas = useMemo(() => entities.filter(e => e.type === 'escena'), [entities]);
  const capitulos = useMemo(() => entities.filter(e => e.type === 'capitulo'), [entities]);

  // Anything not in the main narrative sections lives in "Más" (collapsed).
  const moreTypes = ['regla', 'motivo', 'tema', 'pregunta', 'hilo', 'objeto', 'faccion', 'relacion'];
  const moreEntities = useMemo(() => entities.filter(e => moreTypes.includes(e.type)), [entities]);
  const moreCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of moreEntities) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [moreEntities]);

  const summary = useMemo(() => liveSummary(entities, projectTitle), [entities, projectTitle]);
  const taglineText = logline?.body.trim().split('\n')[0] ?? null;
  const worldProse = useMemo(() => prosePreview(mundo), [mundo]);
  const synopsisProse = useMemo(() => prosePreview(sinopsis, 350), [sinopsis]);
  const beats = useMemo(() => extractBeats(estructura), [estructura]);
  const toneSample = useMemo(() => extractToneSample(tono), [tono]);

  const progress = useMemo(() => phaseProgress(entities), [entities]);
  const phaseId: PhaseId = useMemo(() => currentPhase(entities), [entities]);
  const currentPhaseIdx = PHASES.findIndex(p => p.id === phaseId);

  const isEmpty = entities.length === 0;

  return (
    <aside className="w-[480px] shrink-0 bg-slate-50 border-l-2 border-slate-300 flex flex-col h-full">
      {/* HERO — title + tagline + live summary */}
      <header className="px-5 pt-4 pb-3 border-b-2 border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
        {taglineText ? (
          <blockquote className="text-[15px] text-slate-800 leading-snug italic border-l-3 border-indigo-400 pl-3 mb-3 font-medium">
            “{taglineText}”
          </blockquote>
        ) : (
          <h2 className="text-base font-bold text-slate-900 mb-1">{projectTitle}</h2>
        )}
        <p className="text-[13px] text-slate-700 leading-relaxed">{summary}</p>

        {/* Phase tracker — visual progress bar of 4 phases */}
        <div className="mt-3 flex items-center gap-1.5">
          {PHASES.map((p, i) => {
            const isCurrent = p.id === phaseId;
            const isPast = i < currentPhaseIdx;
            return (
              <div key={p.id} className="flex-1 group" title={`${p.label} — ${p.description}`}>
                <div className={`h-1.5 rounded-full transition ${
                  isPast ? 'bg-indigo-500' :
                  isCurrent ? 'bg-indigo-400' :
                  'bg-slate-200 border border-slate-300'
                }`} />
                <div className={`mt-1 text-[10px] font-semibold text-center truncate ${
                  isCurrent ? 'text-indigo-700' :
                  isPast ? 'text-indigo-600' :
                  'text-slate-400'
                }`}>
                  {p.label.replace('La ', '').replace('Los ', '')}
                  {isPast && ' ✓'}
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {isEmpty && (
          <div className="px-3 py-12 text-center text-sm text-slate-600">
            <div className="text-4xl mb-3">📖</div>
            <p className="leading-relaxed">
              Tu historia aún no ha empezado. Habla con la IA a la izquierda —
              los personajes y el mundo aparecerán aquí.
            </p>
          </div>
        )}

        {/* QUIÉN — character gallery */}
        {personajes.length > 0 && (
          <NarrativeSection
            title="Quién"
            count={personajes.length}
            onAdd={() => onSuggestion('Propón un nuevo personaje secundario que enriquezca la historia: un nombre, un rol y por qué importa.')}
            addLabel="+ Añadir personaje"
          >
            <div className="grid grid-cols-2 gap-2.5">
              {personajes.map(p => {
                const def = getTypeDef('personaje');
                const cls = colorClasses(def.color);
                const essence = extractEssence(p);
                const role = extractRole(p);
                const isPulsing = pulsingIds.has(`personaje/${p.slug}`);
                return (
                  <button
                    key={p.slug}
                    onClick={() => { onFocus(`personaje/${p.slug}`); onOpenEntity(p); }}
                    className={`group bg-white border-2 ${cls.border} hover:ring-4 hover:${cls.ring} rounded-xl p-3 text-left transition shadow-sm hover:shadow-md ${isPulsing ? 'animate-pulse-once' : ''}`}
                  >
                    <div className={`w-12 h-12 rounded-full ${cls.bg} flex items-center justify-center text-2xl mb-2 border-2 ${cls.border}`}>
                      {p.icon ?? '👤'}
                    </div>
                    <div className="font-bold text-slate-900 text-sm leading-tight mb-0.5 truncate">{p.name}</div>
                    {role && (
                      <div className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${cls.bg} ${cls.text} font-semibold uppercase tracking-wide mb-1`}>
                        {role}
                      </div>
                    )}
                    {essence && (
                      <div className="text-[11px] text-slate-600 leading-snug line-clamp-3 italic">
                        {essence}
                      </div>
                    )}
                    {p.status === 'locked' && <div className="mt-1 text-[10px] text-amber-700">🔒 Canon</div>}
                  </button>
                );
              })}
            </div>
          </NarrativeSection>
        )}

        {/* DÓNDE — world + places */}
        {(mundo || lugares.length > 0) && (
          <NarrativeSection
            title="Dónde"
            count={(mundo ? 1 : 0) + lugares.length}
            onAdd={() => onSuggestion('Propón un nuevo lugar relevante para la historia con su descripción física, sensorial y qué pasa allí.')}
            addLabel="+ Añadir lugar"
          >
            {worldProse && mundo && (
              <button
                onClick={() => onOpenEntity(mundo)}
                className="w-full text-left p-3 bg-white border-2 border-teal-200 hover:border-teal-300 rounded-xl mb-2.5 shadow-sm hover:shadow-md transition group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">🌍</span>
                  <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">El mundo</span>
                </div>
                <p className="text-[13px] text-slate-800 leading-relaxed">{worldProse}</p>
              </button>
            )}
            {lugares.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lugares.map(l => {
                  const cls = colorClasses('emerald');
                  return (
                    <button
                      key={l.slug}
                      onClick={() => onOpenEntity(l)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 ${cls.border} ${cls.text} hover:bg-emerald-50 rounded-full text-sm font-semibold transition shadow-sm`}
                    >
                      <span>📍</span>
                      <span>{l.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </NarrativeSection>
        )}

        {/* QUÉ PASA — synopsis + beats + scene/chapter counts */}
        {(sinopsis || estructura || escenas.length > 0 || capitulos.length > 0) && (
          <NarrativeSection
            title="Qué pasa"
            count={(sinopsis ? 1 : 0) + (estructura ? 1 : 0) + escenas.length + capitulos.length}
          >
            {synopsisProse && sinopsis && (
              <button
                onClick={() => onOpenEntity(sinopsis)}
                className="w-full text-left p-3 bg-white border-2 border-sky-200 hover:border-sky-300 rounded-xl mb-2.5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">📜</span>
                  <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">Sinopsis</span>
                </div>
                <p className="text-[13px] text-slate-800 leading-relaxed">{synopsisProse}</p>
              </button>
            )}

            {/* Beat tracker — visual structural progress */}
            {(estructura || beats.some(b => b.done)) && (
              <button
                onClick={() => estructura ? onOpenEntity(estructura) : onSuggestion('Vamos a definir la estructura en 5 actos: Setup, Disastro 1, Midpoint, Disastro 3, Resolución.')}
                className="w-full text-left p-3 bg-white border-2 border-lime-200 hover:border-lime-300 rounded-xl mb-2.5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🏗️</span>
                  <span className="text-xs font-bold text-lime-700 uppercase tracking-wide">Estructura</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {beats.map((b, i) => (
                    <span key={b.key} className="flex-1 text-center">
                      <span className={`block w-3 h-3 mx-auto rounded-full ${b.done ? 'bg-lime-500' : 'bg-slate-200 border border-slate-300'}`} />
                      <span className={`block text-[9px] mt-1 ${b.done ? 'text-lime-700 font-bold' : 'text-slate-400'}`}>
                        {b.label.split(' ')[0]}
                      </span>
                      {i < beats.length - 1 && (
                        <span className={`hidden ${b.done && beats[i + 1].done ? 'bg-lime-400' : 'bg-slate-200'}`} />
                      )}
                    </span>
                  ))}
                </div>
              </button>
            )}

            {/* Scene + chapter counts as a single calm line, not a wall of cards */}
            {(escenas.length > 0 || capitulos.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {capitulos.length > 0 && (
                  <button
                    onClick={() => capitulos[0] && onOpenEntity(capitulos[0])}
                    className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-pink-200 hover:border-pink-300 rounded-lg shadow-sm transition"
                    title="Ver capítulos"
                  >
                    <span>📖</span>
                    <span className="text-sm font-bold text-slate-800">
                      {capitulos.length} {capitulos.length === 1 ? 'capítulo' : 'capítulos'}
                    </span>
                  </button>
                )}
                {escenas.length > 0 && (
                  <button
                    onClick={() => escenas[0] && onOpenEntity(escenas[0])}
                    className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-slate-300 rounded-lg shadow-sm transition"
                    title="Ver escenas"
                  >
                    <span>🎬</span>
                    <span className="text-sm font-bold text-slate-800">
                      {escenas.length} {escenas.length === 1 ? 'escena' : 'escenas'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </NarrativeSection>
        )}

        {/* TONE SAMPLE — when there's a "## Muestra" in the tono entity */}
        {(tono || toneSample) && (
          <NarrativeSection title="Tono y voz">
            {tono && (
              <button
                onClick={() => onOpenEntity(tono)}
                className="w-full text-left p-3 bg-white border-2 border-cyan-200 hover:border-cyan-300 rounded-xl shadow-sm hover:shadow-md transition mb-2.5"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">🎨</span>
                  <span className="text-xs font-bold text-cyan-700 uppercase tracking-wide">Voz narrativa</span>
                </div>
                {toneSample ? (
                  <blockquote className="text-[13px] text-slate-800 italic leading-relaxed border-l-3 border-cyan-300 pl-3 line-clamp-6">
                    {toneSample}
                  </blockquote>
                ) : (
                  <p className="text-[13px] text-slate-600">La voz está definida pero aún no hay muestra de tono.</p>
                )}
              </button>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onSuggestion('Genera una muestra alternativa de tono — un párrafo de 3-6 frases que represente otra vía estilística posible, manteniendo la persona y el tiempo verbal.')}
                className="px-3 py-1.5 text-xs bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-full border-2 border-cyan-200 font-semibold transition"
              >
                🔊 Otra muestra
              </button>
              {!toneSample && tono && (
                <button
                  onClick={() => onSuggestion('Escribe una muestra de tono dentro de la entidad tono/main — un párrafo de 3-6 frases que ejemplifique la voz que queremos en Fase 2.')}
                  className="px-3 py-1.5 text-xs bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-full border-2 border-cyan-200 font-semibold transition"
                >
                  ✨ Crear muestra
                </button>
              )}
            </div>
          </NarrativeSection>
        )}

        {/* MORE — collapsed bundle of secondary types */}
        {moreEntities.length > 0 && (
          <div className="bg-white rounded-xl border-2 border-slate-200">
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition text-left"
            >
              <span className="text-base">✨</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900">Más</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {[...moreCounts.entries()].map(([t, n]) => `${getTypeDef(t).icon} ${n} ${getTypeDef(t).pluralLabel.toLowerCase()}`).join(' · ')}
                </span>
              </span>
              <span className={`text-slate-400 text-sm transition-transform ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {moreOpen && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
                {moreEntities.map(e => {
                  const def = getTypeDef(e.type);
                  const cls = colorClasses(def.color);
                  return (
                    <button
                      key={`${e.type}/${e.slug}`}
                      onClick={() => onOpenEntity(e)}
                      className="w-full flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-left transition"
                    >
                      <span className={`w-7 h-7 rounded-lg ${cls.bg} flex items-center justify-center text-base shrink-0`}>
                        {def.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-900 truncate">{e.name}</span>
                        <span className={`block text-[10px] ${cls.text} font-bold uppercase tracking-wide`}>{def.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Phase coaching nudge — bottom of canvas */}
        {!isEmpty && (
          <div className="p-3 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-xl text-xs text-indigo-800 leading-relaxed">
            <strong className="block mb-1">Estás en {PHASES.find(p => p.id === phaseId)?.label.toLowerCase()}.</strong>
            {PHASES.find(p => p.id === phaseId)?.description}
            {!progress[phaseId].ready && (
              <span className="block mt-1.5 text-indigo-600">
                {progress[phaseId].count} / {progress[phaseId].phase.threshold} elementos listos para pasar de fase.
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function NarrativeSection({
  title, count, onAdd, addLabel, children,
}: {
  title: string;
  count?: number;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-700">{title}</h3>
        {typeof count === 'number' && count > 0 && (
          <span className="text-xs text-slate-500 font-mono">{count}</span>
        )}
        <div className="flex-1" />
        {onAdd && addLabel && (
          <button
            onClick={onAdd}
            className="text-[11px] text-indigo-700 hover:text-indigo-900 font-semibold"
            title={addLabel}
          >
            {addLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
