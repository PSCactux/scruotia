'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { getTypeDef } from '@/lib/entity-types';
import { parseBody, getField } from '@/lib/body-fields';
import type { Entity } from '@/lib/entities';

/**
 * EditableContext is provided by `EntityCard` when the host (EntityModal)
 * passes `editable` handlers. If null, every field renders read-only.
 *
 * `onPatch` writes a manual value typed by the user.
 * `onAskAI` triggers the /api/inline-ai endpoint for a single field.
 * `isPending(key)` lets primitives show a per-field spinner.
 */
type Editable = {
  onPatch: (key: string, value: string) => Promise<void>;
  onAskAI: (key: string, instruction?: string) => Promise<void>;
  /** Opens BranchExplorer scoped to this field — generates N alternative values. */
  onSketch: (key: string) => void;
  isPending: (key: string) => boolean;
};

const EditableContext = createContext<Editable | null>(null);

type CardProps = {
  entity: Entity;
  /** Optional handler to fire macro AI prompts from the card actions (legacy footer buttons). */
  onAction?: (prompt: string) => void;
  /** When provided, the card switches to inline-edit mode. */
  editable?: Editable;
};

/**
 * Type-aware visual card for an entity. Replaces the raw markdown view in
 * `EntityModal`. Each type has its own layout — personaje is a portrait,
 * escena is a beat sheet, lugar is atmosphere, etc. Generic types fall back
 * to a clean markdown render with the same header chrome.
 *
 * Cards are pure presentation — they don't mutate state. Edit is still the
 * markdown textarea in `EntityModal` (inline-edit comes in Ola C).
 */
export default function EntityCard({ entity, onAction, editable }: CardProps) {
  const inner = (() => {
    switch (entity.type) {
      case 'personaje':  return <PersonajeCard  entity={entity} onAction={onAction} />;
      case 'escena':     return <EscenaCard     entity={entity} onAction={onAction} />;
      case 'lugar':      return <LugarCard      entity={entity} onAction={onAction} />;
      case 'mundo':      return <MundoCard      entity={entity} onAction={onAction} />;
      case 'estructura': return <EstructuraCard entity={entity} onAction={onAction} />;
      case 'sinopsis':   return <SinopsisCard   entity={entity} onAction={onAction} />;
      case 'tono':       return <TonoCard       entity={entity} onAction={onAction} />;
      case 'logline':    return <LoglineCard    entity={entity} onAction={onAction} />;
      default:           return <GenericCard    entity={entity} onAction={onAction} />;
    }
  })();
  return (
    <EditableContext.Provider value={editable ?? null}>{inner}</EditableContext.Provider>
  );
}

/**
 * Wraps the *value* of a field. When inline-edit context is present:
 *  - click on the value → input/textarea
 *  - Enter saves (textarea: Cmd/Ctrl+Enter)
 *  - Esc cancels
 *  - hover shows a ✨ button that asks the AI for that field only
 * When no context, renders as static text (the read-only preview mode).
 */
function EditableValue({
  fieldKey,
  value,
  multiline = false,
  className = '',
  placeholder = '(vacío)',
}: {
  fieldKey?: string;
  value: string;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const ctx = useContext(EditableContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.select?.(); }
      });
    }
  }, [editing]);

  if (!ctx || !fieldKey) {
    return value
      ? <span className={className}>{value}</span>
      : <span className={`${className} text-slate-400 italic`}>{placeholder}</span>;
  }

  const pending = ctx.isPending(fieldKey);

  async function save() {
    if (draft === value) { setEditing(false); return; }
    await ctx!.onPatch(fieldKey!, draft);
    setEditing(false);
  }

  if (editing) {
    const InputEl = multiline ? 'textarea' : 'input';
    return (
      <div className="space-y-1">
        <InputEl
          ref={inputRef as React.Ref<HTMLInputElement & HTMLTextAreaElement>}
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
            if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          }}
          rows={multiline ? 3 : undefined}
          className={`${className} w-full px-2 py-1 bg-white border-2 border-indigo-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-200 ${multiline ? 'resize-y min-h-16' : ''}`}
        />
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono">
            {multiline ? '⌘↵' : '↵'}
          </kbd> guardar
          <span className="mx-1">·</span>
          <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono">Esc</kbd> cancelar
          <div className="flex-1" />
          <button onClick={() => { setDraft(value); setEditing(false); }} className="text-slate-500 hover:text-slate-800 px-1">cancelar</button>
          <button onClick={save} className="text-indigo-700 hover:text-indigo-900 font-bold px-1">guardar</button>
        </div>
      </div>
    );
  }

  return (
    <span className="group/edit relative inline-flex items-start gap-1.5 w-full">
      <span
        onClick={() => setEditing(true)}
        className={`${className} flex-1 cursor-text rounded px-1 -mx-1 hover:bg-indigo-50/60 transition`}
        title="Click para editar"
      >
        {pending ? <span className="text-indigo-500 italic">✨ pensando…</span>
          : value || <span className="text-slate-400 italic">{placeholder}</span>}
      </span>
      <span className="opacity-0 group-hover/edit:opacity-100 transition shrink-0 mt-0.5 flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onAskAI(fieldKey); }}
          disabled={pending}
          className="text-[10px] px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded font-bold leading-none"
          title="Pedir a la IA que rellene este campo"
        >✨</button>
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onSketch(fieldKey); }}
          disabled={pending}
          className="text-[10px] px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white rounded font-bold leading-none"
          title="Generar 3 variantes alternativas de este campo"
        >🌿</button>
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PERSONAJE — portrait + want/need destacados + fields grid + prose
   ───────────────────────────────────────────────────────────────────── */

function PersonajeCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  const wantKey = p.fields.find(f => /want|lo que quiere/i.test(f.key));
  const needKey = p.fields.find(f => /need|necesidad|lo que se lo impide/i.test(f.key));
  const arcoKey = p.fields.find(f => /arco/i.test(f.key));
  const rolKey  = p.fields.find(f => /^rol$/i.test(f.key));
  const otherFields = p.fields.filter(f => f !== wantKey && f !== needKey && f !== arcoKey && f !== rolKey);

  return (
    <article>
      <div className="bg-gradient-to-br from-indigo-100 via-fuchsia-50 to-rose-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-indigo-100">
        <div className="flex gap-5 items-start">
          <div className="w-20 h-20 rounded-2xl bg-white shadow-md flex items-center justify-center text-4xl border-2 border-indigo-200 shrink-0">
            {entity.icon ?? '👤'}
          </div>
          <div className="flex-1 min-w-0">
            {rolKey && (
              <div className="inline-block text-[10px] uppercase tracking-widest text-indigo-700 font-bold mb-1 px-2 py-0.5 bg-white/70 rounded-full">
                <EditableValue fieldKey={rolKey.key} value={rolKey.value} />
              </div>
            )}
            <p className="text-lg text-slate-800 italic leading-snug mt-1">
              <EditableValue fieldKey="__intro" value={p.intro} multiline placeholder="(añade una frase-tagline)" />
            </p>
          </div>
        </div>
      </div>

      {/* WANT / NEED hero */}
      {(wantKey || needKey) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {wantKey && (
            <Hero label={wantKey.key} value={wantKey.value} tone="fuchsia" icon="🎯" fieldKey={wantKey.key} />
          )}
          {needKey && (
            <Hero label={needKey.key} value={needKey.value} tone="violet" icon="💡" fieldKey={needKey.key} />
          )}
        </div>
      )}

      {/* ARCO */}
      {arcoKey && (
        <div className="mb-5 p-3 bg-slate-50 border-l-4 border-indigo-300 rounded-r-lg">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Arco</div>
          <div className="text-sm text-slate-900 mt-0.5">
            <EditableValue fieldKey={arcoKey.key} value={arcoKey.value} multiline />
          </div>
        </div>
      )}

      {/* OTHER FIELDS */}
      {otherFields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 mb-5">
          {otherFields.map((f, i) => (
            <Field key={i} label={f.key} value={f.value} fieldKey={f.key} />
          ))}
        </div>
      )}

      {p.trailingProse && (
        <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>
      )}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ESCENA — beat sheet cinematográfico
   ───────────────────────────────────────────────────────────────────── */

function EscenaCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  const beat       = getField(p, /^beat$/i);
  const capitulo   = getField(p, /cap[íi]tulo/i);
  const pov        = getField(p, /^pov$/i);
  const presentes  = getField(p, /personajes/i);
  const ubicacion  = getField(p, /ubicaci[óo]n/i);
  const quePasa    = getField(p, /qu[ée] pasa/i);
  const conflicto  = getField(p, /^conflicto$/i);
  const resolucion = getField(p, /resoluci[óo]n/i);
  const inicio     = getField(p, /(?:estado emocional|emocional).*inicio|inicio.*pov/i);
  const fin        = getField(p, /(?:estado emocional|emocional).*fin|fin.*pov/i);
  const info       = getField(p, /info nueva/i);
  const planta     = getField(p, /^planta/i);
  const paga       = getField(p, /^paga/i);
  const target     = getField(p, /target/i);

  return (
    <article>
      <div className="bg-slate-900 text-white -mx-5 -mt-5 px-6 py-4 mb-5 flex items-center gap-4 rounded-t-xl">
        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-xl border-2 border-slate-700">🎬</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Escena · {beat || 'sin beat'}</div>
          {capitulo && <div className="text-xs text-slate-300 mt-0.5">{capitulo}</div>}
        </div>
        {target && (
          <div className="text-right">
            <div className="text-[10px] uppercase text-slate-400 tracking-wider font-bold">Target</div>
            <div className="text-xl font-black text-emerald-300 leading-tight">{target}</div>
          </div>
        )}
      </div>

      {(pov || ubicacion || presentes) && (
        <div className="grid grid-cols-3 gap-2 mb-5 -mx-1">
          {pov && <HeroSlot icon="🎭" label="POV" value={pov} fieldKey={p.fields.find(f => /^pov$/i.test(f.key))?.key} />}
          {ubicacion && <HeroSlot icon="📍" label="Lugar" value={ubicacion} fieldKey={p.fields.find(f => /ubicaci[óo]n/i.test(f.key))?.key} />}
          {presentes && <HeroSlot icon="👥" label="Presentes" value={presentes} fieldKey={p.fields.find(f => /personajes/i.test(f.key))?.key} />}
        </div>
      )}

      {quePasa && (
        <div className="mb-5">
          <SectionLabel>Qué pasa</SectionLabel>
          <p className="text-base text-slate-900 leading-relaxed">
            <EditableValue fieldKey={p.fields.find(f => /qu[ée] pasa/i.test(f.key))?.key} value={quePasa} multiline />
          </p>
        </div>
      )}

      {(conflicto || resolucion) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {conflicto && <Block label="⚔️ Conflicto" tone="rose" fieldKey={p.fields.find(f => /^conflicto$/i.test(f.key))?.key} value={conflicto} />}
          {resolucion && <Block label="✓ Resolución" tone="emerald" fieldKey={p.fields.find(f => /resoluci[óo]n/i.test(f.key))?.key} value={resolucion} />}
        </div>
      )}

      {(inicio || fin) && (
        <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <SectionLabel>Arco emocional del POV</SectionLabel>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 bg-white border-2 border-slate-200 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Inicio</div>
              <div className="text-sm text-slate-900 mt-0.5">
                <EditableValue fieldKey={p.fields.find(f => /(estado emocional|emocional).*inicio|inicio.*pov/i.test(f.key))?.key} value={inicio} multiline />
              </div>
            </div>
            <div className="text-2xl text-slate-400">→</div>
            <div className="flex-1 bg-white border-2 border-emerald-200 rounded-lg p-2.5">
              <div className="text-[10px] text-emerald-700 font-bold uppercase">Fin</div>
              <div className="text-sm text-slate-900 mt-0.5">
                <EditableValue fieldKey={p.fields.find(f => /(estado emocional|emocional).*fin|fin.*pov/i.test(f.key))?.key} value={fin} multiline />
              </div>
            </div>
          </div>
        </div>
      )}

      {(planta || paga || info) && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {planta && <Block label="🌱 Planta" tone="amber" fieldKey={p.fields.find(f => /^planta/i.test(f.key))?.key} value={planta} />}
          {paga && <Block label="💰 Paga" tone="violet" fieldKey={p.fields.find(f => /^paga/i.test(f.key))?.key} value={paga} />}
          {info && <Block label="📡 Info al lector" tone="sky" fieldKey={p.fields.find(f => /info nueva/i.test(f.key))?.key} value={info} />}
        </div>
      )}

      {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LUGAR — atmosphere
   ───────────────────────────────────────────────────────────────────── */

function LugarCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  const tipo = getField(p, /^tipo$/i);
  const desc = getField(p, /descripci[óo]n/i);
  const sens = getField(p, /sensaciones/i);
  const personajes = getField(p, /qui[ée]n aparece/i);
  const eventos = getField(p, /eventos clave/i);
  const otros = p.fields.filter(f => !/^tipo$|descripci[óo]n|sensaciones|qui[ée]n aparece|eventos clave/i.test(f.key));

  return (
    <article>
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-emerald-100 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl border-2 border-emerald-200">{entity.icon ?? '📍'}</div>
          <div>
            {tipo && (
              <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">{tipo}</div>
            )}
            {p.intro && <p className="text-sm text-slate-800 italic leading-snug mt-0.5">{p.intro}</p>}
          </div>
        </div>
      </div>

      {desc && <ProseBlock label="Descripción física">{desc}</ProseBlock>}
      {sens && (
        <div className="my-4 p-4 bg-emerald-50/40 border-l-4 border-emerald-300 rounded-r-lg">
          <SectionLabel>Sensaciones</SectionLabel>
          <p className="text-sm text-slate-800 leading-relaxed mt-1 italic">
            <EditableValue fieldKey={p.fields.find(f => /sensaciones/i.test(f.key))?.key} value={sens} multiline />
          </p>
        </div>
      )}
      {personajes && <Field label="Quién aparece aquí" value={personajes} fieldKey={p.fields.find(f => /qui[ée]n aparece/i.test(f.key))?.key} />}
      {eventos && <Field label="Eventos clave" value={eventos} fieldKey={p.fields.find(f => /eventos clave/i.test(f.key))?.key} />}
      {otros.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {otros.map((f, i) => <Field key={i} label={f.key} value={f.value} fieldKey={f.key} />)}
        </div>
      )}
      {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MUNDO — sections accordion-like
   ───────────────────────────────────────────────────────────────────── */

function MundoCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  return (
    <article>
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-teal-100 rounded-t-xl flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl border-2 border-teal-200">{entity.icon ?? '🌍'}</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-teal-700 font-bold">El mundo</div>
          {p.intro && <p className="text-sm text-slate-800 italic leading-snug mt-0.5">{p.intro}</p>}
        </div>
      </div>

      {p.sections.length === 0 && p.fields.length === 0 && !p.intro && (
        <div className="text-sm text-slate-500 italic">Aún sin descripción del mundo.</div>
      )}

      {p.sections.map((s, i) => (
        <details key={i} className="mb-2.5 group border-2 border-slate-200 rounded-xl overflow-hidden bg-white" open={i === 0}>
          <summary className="px-4 py-3 cursor-pointer font-bold text-slate-800 hover:bg-slate-50 transition flex items-center gap-2 list-none">
            <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
            <span>{s.title}</span>
          </summary>
          <div className="px-4 pb-4 pt-1 prose prose-sm max-w-none">
            <ReactMarkdown>{s.body}</ReactMarkdown>
          </div>
        </details>
      ))}

      {p.fields.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {p.fields.map((f, i) => <Field key={i} label={f.key} value={f.value} />)}
        </div>
      )}

      {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ESTRUCTURA — 5-act visual
   ───────────────────────────────────────────────────────────────────── */

function EstructuraCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  // Estructura is template-only ## sections (Setup / D1 / D2 / D3 / Resolución).
  const acts = ['Setup', 'Disastro 1', 'Disastro 2', 'Disastro 3', 'Resolución'];
  return (
    <article>
      <div className="bg-gradient-to-br from-lime-50 to-yellow-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-lime-100 rounded-t-xl flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl border-2 border-lime-200">{entity.icon ?? '🏗️'}</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-lime-700 font-bold">Estructura</div>
          {p.intro && <p className="text-sm text-slate-800 italic leading-snug mt-0.5">{p.intro}</p>}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-5">
        {acts.map((act, i) => {
          const section = p.sections.find(s => s.title.toLowerCase().includes(act.toLowerCase().split(' ')[0]));
          const done = Boolean(section?.body.trim());
          return (
            <div key={act} className={`p-2 rounded-lg text-center ${done ? 'bg-lime-100 border-2 border-lime-300' : 'bg-slate-100 border border-slate-200'}`}>
              <div className={`text-[10px] uppercase font-bold ${done ? 'text-lime-800' : 'text-slate-500'}`}>{act}</div>
              <div className={`mt-1 w-2 h-2 mx-auto rounded-full ${done ? 'bg-lime-500' : 'bg-slate-300'}`} />
              <div className="text-[9px] text-slate-500 mt-1">Acto {i + 1}</div>
            </div>
          );
        })}
      </div>

      {p.sections.map((s, i) => (
        <div key={i} className="mb-4 p-4 bg-white border border-slate-200 rounded-xl">
          <SectionLabel>{s.title}</SectionLabel>
          <div className="prose prose-sm max-w-none mt-1.5">
            <ReactMarkdown>{s.body}</ReactMarkdown>
          </div>
        </div>
      ))}

      {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SINOPSIS — 4 acts as prose blocks
   ───────────────────────────────────────────────────────────────────── */

function SinopsisCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  return (
    <article>
      <div className="bg-gradient-to-br from-sky-50 to-indigo-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-sky-100 rounded-t-xl flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl border-2 border-sky-200">{entity.icon ?? '📜'}</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-sky-700 font-bold">Sinopsis</div>
        </div>
      </div>

      {p.intro && <p className="text-base text-slate-800 leading-relaxed mb-4 italic">{p.intro}</p>}

      {p.sections.map((s, i) => (
        <section key={i} className="mb-5">
          <h3 className="text-sm font-bold text-sky-800 mb-1.5">{s.title}</h3>
          <div className="prose prose-sm max-w-none text-slate-800">
            <ReactMarkdown>{s.body}</ReactMarkdown>
          </div>
        </section>
      ))}
      {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TONO — sample as hero
   ───────────────────────────────────────────────────────────────────── */

function TonoCard({ entity }: CardProps) {
  const p = parseBody(entity.body);
  const muestra = p.sections.find(s => /muestra/i.test(s.title));
  const notas = p.sections.find(s => /notas/i.test(s.title));
  return (
    <article>
      <div className="bg-gradient-to-br from-cyan-50 to-sky-50 -mx-5 -mt-5 px-6 py-5 mb-5 border-b-2 border-cyan-100 rounded-t-xl flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-3xl border-2 border-cyan-200">{entity.icon ?? '🎨'}</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-700 font-bold">Voz narrativa</div>
        </div>
      </div>

      {p.fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          {p.fields.map((f, i) => (
            <div key={i} className="px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-cyan-700 font-bold">{f.key}</div>
              <div className="text-sm text-slate-900 mt-0.5">{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {muestra && (
        <div className="my-5 p-5 bg-white border-2 border-cyan-200 rounded-xl shadow-sm">
          <SectionLabel>Muestra del tono</SectionLabel>
          <blockquote className="mt-2 text-base text-slate-800 italic leading-relaxed border-l-4 border-cyan-300 pl-4">
            {muestra.body.trim() || <span className="text-slate-400">(aún sin muestra)</span>}
          </blockquote>
        </div>
      )}
      {notas && notas.body.trim() && <ProseBlock label="Notas">{notas.body.trim()}</ProseBlock>}
      {p.pendiente && <PendienteBlock text={p.pendiente} />}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LOGLINE — single sentence hero
   ───────────────────────────────────────────────────────────────────── */

function LoglineCard({ entity }: CardProps) {
  const line = entity.body.trim().split('\n').find(l => l.trim() && !/^\(/.test(l.trim())) ?? entity.body.trim();
  return (
    <article>
      <div className="bg-gradient-to-br from-fuchsia-100 via-rose-50 to-amber-50 p-7 rounded-xl border-2 border-fuchsia-200 shadow-sm">
        <div className="text-[10px] uppercase tracking-widest text-fuchsia-700 font-bold mb-3 flex items-center gap-1.5">
          <span>🪧</span><span>Logline</span>
        </div>
        <blockquote className="text-xl text-slate-900 font-semibold italic leading-snug">
          &ldquo;{line}&rdquo;
        </blockquote>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   GENERIC — clean header + parsed bullets + sections + markdown fallback
   ───────────────────────────────────────────────────────────────────── */

function GenericCard({ entity }: CardProps) {
  const def = getTypeDef(entity.type);
  const p = parseBody(entity.body);
  const hasStructure = p.intro || p.fields.length > 0 || p.sections.length > 0 || p.trailingProse || p.pendiente;

  return (
    <article>
      <div className="bg-gradient-to-br from-slate-50 to-white -mx-5 -mt-5 px-6 py-4 mb-5 border-b border-slate-200 rounded-t-xl flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white shadow-md flex items-center justify-center text-2xl border border-slate-200">{entity.icon ?? def.icon}</div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">{def.label}</div>
        </div>
      </div>

      {hasStructure ? (
        <>
          {p.intro && <p className="text-base text-slate-800 leading-relaxed mb-4 italic">{p.intro}</p>}
          {p.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {p.fields.map((f, i) => <Field key={i} label={f.key} value={f.value} fieldKey={f.key} />)}
            </div>
          )}
          {p.sections.map((s, i) => (
            <div key={i} className="mb-3">
              <h3 className="text-sm font-bold text-slate-800 mb-1">{s.title}</h3>
              <div className="prose prose-sm max-w-none text-slate-800">
                <ReactMarkdown>{s.body}</ReactMarkdown>
              </div>
            </div>
          ))}
          {p.trailingProse && <ProseBlock label="Notas">{p.trailingProse}</ProseBlock>}
          {p.pendiente && <PendienteBlock text={p.pendiente} />}
        </>
      ) : (
        <div className="prose prose-slate max-w-none prose-sm">
          <ReactMarkdown>{entity.body || '_Sin contenido._'}</ReactMarkdown>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   ───────────────────────────────────────────────────────────────────── */

function Hero({ label, value, tone, icon, fieldKey }: { label: string; value: string; tone: 'fuchsia' | 'violet'; icon: string; fieldKey?: string }) {
  const styles = tone === 'fuchsia'
    ? 'border-fuchsia-200 bg-fuchsia-50/60'
    : 'border-violet-200 bg-violet-50/60';
  const labelTone = tone === 'fuchsia' ? 'text-fuchsia-700' : 'text-violet-700';
  return (
    <div className={`p-3 rounded-xl border-2 ${styles}`}>
      <div className={`text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 ${labelTone}`}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div className="text-sm text-slate-900 mt-1 leading-snug">
        <EditableValue fieldKey={fieldKey} value={value} multiline />
      </div>
    </div>
  );
}

function Field({ label, value, fieldKey }: { label: string; value: string; fieldKey?: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-50/60 border border-slate-200">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5 leading-snug">
        <EditableValue fieldKey={fieldKey} value={value} multiline />
      </div>
    </div>
  );
}

function HeroSlot({ icon, label, value, fieldKey }: { icon: string; label: string; value: string; fieldKey?: string }) {
  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg text-center">
      <div className="text-xl">{icon}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mt-0.5">{label}</div>
      <div className="text-xs font-semibold text-slate-900 mt-0.5">
        <EditableValue fieldKey={fieldKey} value={value} />
      </div>
    </div>
  );
}

function Block({ label, tone, children, fieldKey, value }: { label: string; tone: string; children?: React.ReactNode; fieldKey?: string; value?: string }) {
  const toneClass: Record<string, string> = {
    rose: 'border-rose-200 bg-rose-50/40 text-rose-800',
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50/40 text-amber-800',
    violet: 'border-violet-200 bg-violet-50/40 text-violet-800',
    sky: 'border-sky-200 bg-sky-50/40 text-sky-800',
  };
  const t = toneClass[tone] ?? toneClass.rose;
  return (
    <div className={`p-3 rounded-lg border-2 ${t}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold">{label}</div>
      <div className="text-sm text-slate-900 mt-1 leading-snug">
        {fieldKey
          ? <EditableValue fieldKey={fieldKey} value={value ?? ''} multiline />
          : children}
      </div>
    </div>
  );
}

function ProseBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="my-4 p-4 bg-slate-50 border-l-4 border-slate-300 rounded-r-lg">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">{label}</div>
      <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{children}</div>
    </div>
  );
}

function PendienteBlock({ text }: { text: string }) {
  return (
    <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <span className="text-lg">📝</span>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wider text-amber-800 font-bold">Pendiente</div>
        <p className="text-sm text-amber-900 italic mt-0.5">{text}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{children}</div>;
}
