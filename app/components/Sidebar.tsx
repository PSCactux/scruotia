import { listProjects } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';
import Link from 'next/link';
import ProjectListItem from './ProjectListItem';

export default async function Sidebar({
  activeSlug,
}: {
  activeSlug?: string;
}) {
  const projects = await listProjects(PROJECTS_ROOT);

  return (
    <aside className="w-64 shrink-0 border-r-2 border-slate-200 bg-white flex flex-col h-screen">
      <div className="p-5 border-b-2 border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            S
          </div>
          <span className="font-bold text-slate-900 text-lg">Scruotia</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
          Proyectos
        </div>
        <ul className="space-y-1 mb-4">
          {projects.map(p => (
            <ProjectListItem key={p.slug} slug={p.slug} title={p.manifest.title} active={activeSlug === p.slug} />
          ))}
        </ul>
        <Link
          href="/new"
          prefetch={false}
          className="block px-3 py-2 rounded-lg text-sm text-indigo-700 hover:bg-indigo-50 font-bold border-2 border-dashed border-slate-300 hover:border-indigo-400 text-center"
        >
          + Nuevo proyecto
        </Link>
      </div>
    </aside>
  );
}
