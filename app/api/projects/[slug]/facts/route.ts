import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

async function factsPath(slug: string): Promise<string> {
  const project = await loadProject(PROJECTS_ROOT, slug);
  const dir = path.join(project.rootPath, '00-premise');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, 'facts.md');
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const file = await factsPath(slug);
    let content = '';
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {/* not yet created */}
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const { content } = (await req.json()) as { content: string };
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    const file = await factsPath(slug);
    await fs.writeFile(file, content, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
