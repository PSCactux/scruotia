import Sidebar from '@/app/components/Sidebar';
import { loadProject } from '@/lib/projects';
import { loadMethodology } from '@/lib/templates';
import { loadMainConversation } from '@/lib/conversations';
import { listEntities } from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { PROJECTS_ROOT } from '@/lib/config';
import ProjectClient from './ProjectClient';
import { notFound } from 'next/navigation';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let project;
  try {
    project = await loadProject(PROJECTS_ROOT, slug);
  } catch {
    notFound();
  }

  // First-time migration from legacy Snowflake step files → entities.
  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);

  const methodology = await loadMethodology(project.manifest.methodology);
  const entities = await listEntities(project.rootPath);

  // Project-level conversation (auto-merges legacy per-step convos on first read).
  const stepOrder = methodology.steps.map(s => s.id);
  const conv = await loadMainConversation(project.rootPath, stepOrder);

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar activeSlug={slug} />
      <ProjectClient
        slug={slug}
        title={project.manifest.title}
        initialEntities={entities}
        initialMessages={conv.messages.map(m => ({
          role: m.role,
          content: m.content,
          focusArtifact: m.focusArtifact,
          suggestions: m.suggestions,
          touched: m.touched,
        }))}
      />
    </div>
  );
}
