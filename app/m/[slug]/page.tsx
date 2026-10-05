import { loadProject } from '@/lib/projects';
import { loadMethodology } from '@/lib/templates';
import { loadMainConversation } from '@/lib/conversations';
import { listEntities } from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { PROJECTS_ROOT } from '@/lib/config';
import { notFound } from 'next/navigation';
import MobileChat from './MobileChat';

/**
 * Mobile companion route — fullscreen chat only, no canvas. Reuses the same
 * /api/chat backend; what differs is the surface: a single column, large
 * touch targets, dismissible sidebar. Use it to capture ideas on the go;
 * come back to desktop to organize.
 */
export default async function MobileProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let project;
  try { project = await loadProject(PROJECTS_ROOT, slug); }
  catch { notFound(); }

  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);

  const methodology = await loadMethodology(project.manifest.methodology);
  const entities = await listEntities(project.rootPath);
  const stepOrder = methodology.steps.map(s => s.id);
  const conv = await loadMainConversation(project.rootPath, stepOrder);

  return (
    <MobileChat
      slug={slug}
      title={project.manifest.title}
      entityCount={entities.length}
      initialMessages={conv.messages.map(m => ({
        role: m.role,
        content: m.content,
        suggestions: m.suggestions,
        touched: m.touched,
      }))}
    />
  );
}
