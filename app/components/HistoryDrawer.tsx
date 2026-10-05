'use client';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Entity } from '@/lib/entities';

type SnapshotInfo = {
  timestamp: string;
  reason: string;
  bytes: number;
  bodyPreview: string;
};

type SnapshotPayload = {
  timestamp: string;
  reason: string;
  body: string;
  frontmatter: Record<string, unknown>;
};

type Props = {
  slug: string;          // project slug
  entity: Entity;        // the live entity whose history we browse
  onClose: () => void;
  onRestored: (entity: Entity) => void;
};

/**
 * Right-side drawer listing all snapshots of an entity, with preview and
 * one-click restore. Opens from `EntityModal`'s footer button ⏪ Historial.
 *
 * Layout:
 *   ┌──────────────────────────┬──────────────────────┐
 *   │ Snapshot timeline (list) │ Preview pane         │
 *   │ • now (live)             │ Body preview         │
 *   │ • 2 min — chat           │ + Restaurar button   │
 *   │ • 8 min — edit           │                      │
 *   └──────────────────────────┴──────────────────────┘
 */
export default function HistoryDrawer({ slug, entity, onClose, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [selected, setSelected] = useState<string | 'live'>('live');
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/projects/${slug}/history?type=${entity.type}&slug=${entity.slug}`);
      if (cancelled) return;
      if (!r.ok) { setError('Error cargando historial.'); return; }
      const data = await r.json();
      setSnapshots(data.snapshots ?? []);
    })();
    return () => { cancelled = true; };
  }, [slug, entity.type, entity.slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (selected === 'live') { setPayload(null); return; }
      const r = await fetch(`/api/projects/${slug}/history?type=${entity.type}&slug=${entity.slug}&timestamp=${encodeURIComponent(selected)}`);
      if (cancelled) return;
      if (!r.ok) return;
      const data = await r.json();
      setPayload(data.snapshot);
    })();
    return () => { cancelled = true; };
  }, [selected, slug, entity.type, entity.slug]);

  async function restore(timestamp: string) {
    if (!confirm('¿Restaurar esta versión? Se guarda un snapshot del estado actual antes (puedes deshacer).')) return;
    setRestoring(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${slug}/history/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entity.type, slug: entity.slug, timestamp }),
      });
      if (!r.ok) { setError('No se pudo restaurar.'); return; }
      const data = await r.json();
      onRestored(data.entity);
      onClose();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex justify-end animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b-2 border-slate-200 bg-slate-50 flex items-center gap-3">
          <span className="text-2xl">⏪</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Historial</div>
            <h2 className="text-base font-bold text-slate-900 truncate">{entity.name}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center text-lg">✕</button>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Timeline */}
          <aside className="w-72 border-r-2 border-slate-200 bg-slate-50/50 overflow-y-auto">
            <button
              onClick={() => setSelected('live')}
              className={`w-full px-4 py-3 text-left border-b border-slate-100 transition flex items-start gap-3 ${
                selected === 'live' ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'hover:bg-white'
              }`}
            >
              <span className={`w-2 h-2 mt-2 rounded-full ${selected === 'live' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  Ahora
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-bold">VIVA</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Estado actual</div>
              </div>
            </button>

            {snapshots === null && (
              <div className="p-6 text-sm text-slate-500 italic">Cargando…</div>
            )}
            {snapshots && snapshots.length === 0 && (
              <div className="p-6 text-sm text-slate-500 italic">
                Sin versiones anteriores todavía. La próxima vez que algo cambie, aparecerá aquí.
              </div>
            )}
            {snapshots && snapshots.map((s) => (
              <button
                key={s.timestamp}
                onClick={() => setSelected(s.timestamp)}
                className={`w-full px-4 py-3 text-left border-b border-slate-100 transition flex items-start gap-3 ${
                  selected === s.timestamp ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-white'
                }`}
              >
                <span className={`w-2 h-2 mt-2 rounded-full ${selected === s.timestamp ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{reasonLabel(s.reason)}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{relativeTime(s.timestamp)}</div>
                  <div className="text-[11px] text-slate-600 mt-1 italic line-clamp-2">{s.bodyPreview || '(sin contenido)'}</div>
                </div>
              </button>
            ))}
          </aside>

          {/* Preview pane */}
          <main className="flex-1 overflow-y-auto bg-white">
            {error && <div className="m-5 p-3 bg-rose-50 border-2 border-rose-200 text-rose-800 rounded-lg text-sm">{error}</div>}

            {selected === 'live' ? (
              <PreviewBlock
                title="Estado actual (viva)"
                subtitle={`Última modificación: ${relativeTime(entity.updated)}`}
                body={entity.body || '_(vacía)_'}
                badge={<span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-bold">VIVA</span>}
              />
            ) : payload ? (
              <PreviewBlock
                title={reasonLabel(payload.reason)}
                subtitle={`Hace ${relativeTime(payload.timestamp)} · ${absoluteTime(payload.timestamp)}`}
                body={payload.body || '_(vacía)_'}
                action={
                  <button
                    onClick={() => restore(payload.timestamp)}
                    disabled={restoring}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
                  >
                    {restoring ? '⏳ Restaurando…' : '↩ Restaurar esta versión'}
                  </button>
                }
              />
            ) : (
              <div className="p-8 text-sm text-slate-500 italic">Cargando snapshot…</div>
            )}
          </main>
        </div>

        <footer className="px-5 py-3 border-t-2 border-slate-200 bg-slate-50 flex items-center gap-3 text-xs text-slate-600">
          <span>📝 Cada cambio guarda una copia automáticamente.</span>
          <span className="text-slate-400">·</span>
          <span>Si superas 30 versiones, se conservan las 10 más recientes y una por día anterior.</span>
        </footer>
      </div>
    </div>
  );
}

function PreviewBlock({ title, subtitle, body, badge, action }: {
  title: string; subtitle: string; body: string;
  badge?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {badge}
      </div>
      <p className="text-xs text-slate-500 mb-5">{subtitle}</p>

      <div className="prose prose-slate max-w-none prose-sm bg-slate-50/60 border border-slate-200 rounded-xl p-4">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>

      {action && <div className="mt-5 flex justify-end">{action}</div>}
    </div>
  );
}

function reasonLabel(r: string): string {
  switch (r) {
    case 'edit':         return '✏️ Editado manualmente';
    case 'chat':         return '💬 La IA actualizó esta entidad';
    case 'delete':       return '🗑️ Eliminada';
    case 'lock':         return '🔒 Bloqueada como canon';
    case 'pre-restore':  return '↩ Pre-restauración (estado anterior a un restore)';
    case 'manual':       return '📌 Snapshot manual';
    default:             return r;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 0) return 'en el futuro';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}
