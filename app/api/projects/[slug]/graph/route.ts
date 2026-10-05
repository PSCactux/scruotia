import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { listEntities } from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const project = await loadProject(PROJECTS_ROOT, slug);

  // First-time migration from legacy Snowflake step files.
  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);

  const entities = await listEntities(project.rootPath);

  let facts = '';
  try {
    facts = await fs.readFile(path.join(project.rootPath, '00-premise', 'facts.md'), 'utf-8');
  } catch {/* none */}

  return NextResponse.json({
    title: project.manifest.title,
    methodology: project.manifest.methodology,
    entities,
    facts,
  });
}
