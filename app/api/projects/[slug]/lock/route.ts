import { NextRequest, NextResponse } from 'next/server';
import { loadProject, updateManifest } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { stepId, locked } = (await req.json()) as { stepId: string; locked: boolean };
  if (!stepId || typeof locked !== 'boolean') {
    return NextResponse.json({ error: 'stepId and locked required' }, { status: 400 });
  }
  const project = await loadProject(PROJECTS_ROOT, slug);
  const current = new Set(project.manifest.lockedSteps ?? []);
  if (locked) current.add(stepId);
  else current.delete(stepId);
  await updateManifest(project, { lockedSteps: [...current] });
  return NextResponse.json({ ok: true, lockedSteps: [...current] });
}
