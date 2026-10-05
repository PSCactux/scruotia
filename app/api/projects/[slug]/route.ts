import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const project = await loadProject(PROJECTS_ROOT, slug);
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }
  const dir = path.join(PROJECTS_ROOT, slug);
  // Defensive: confirm the dir is under PROJECTS_ROOT
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(path.resolve(PROJECTS_ROOT) + path.sep)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  try {
    await fs.rm(resolved, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
