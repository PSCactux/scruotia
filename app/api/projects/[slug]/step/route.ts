import { NextRequest, NextResponse } from 'next/server';
import { loadProject, updateManifest } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { stepId } = await req.json();
  if (!stepId || typeof stepId !== 'string') {
    return NextResponse.json({ error: 'stepId required' }, { status: 400 });
  }
  try {
    const project = await loadProject(PROJECTS_ROOT, slug);
    await updateManifest(project, { currentStep: stepId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
