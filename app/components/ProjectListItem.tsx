'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ProjectListItem({
  slug, title, active,
}: { slug: string; title: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${title}"? Esto borra todos sus archivos y conversaciones.`)) return;
    setBusy(true);
    const r = await fetch(`/api/projects/${slug}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) {
      alert('No se pudo eliminar el proyecto.');
      return;
    }
    if (active) {
      router.push('/');
    } else {
      router.refresh();
    }
  }

  return (
    <li className="group relative">
      <Link
        href={`/p/${slug}`}
        prefetch={false}
        className={`block px-3 py-2 pr-8 rounded-lg text-sm transition ${
          active
            ? 'bg-indigo-100 text-indigo-900 font-bold border-l-4 border-indigo-600 pl-2'
            : 'text-slate-800 hover:bg-slate-100 font-medium'
        }`}
      >
        {title}
      </Link>
      <button
        onClick={onDelete}
        disabled={busy}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition text-xs"
        title="Eliminar proyecto"
      >
        ✕
      </button>
    </li>
  );
}
