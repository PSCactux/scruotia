import { NextRequest, NextResponse } from 'next/server';
import { loadProject } from '@/lib/projects';
import { readEntity, writeEntity, type Entity } from '@/lib/fs-db';
import { PROJECTS_ROOT } from '@/lib/config';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const filePath = req.nextUrl.searchParams.get('file');
  if (!filePath) return NextResponse.json({ error: 'file param required' }, { status: 400 });

  try {
    const project = await loadProject(PROJECTS_ROOT, slug);
    const entity = await readEntity(project.rootPath, filePath);
    return NextResponse.json({ entity });
  } catch (err) {
    // Path traversal or ENOENT
    const msg = (err as Error).message;
    if (msg.includes('traversal')) return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return NextResponse.json({ entity: null });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { file, entity } = (await req.json()) as { file: string; entity: Entity };
  if (!file || !entity) {
    return NextResponse.json({ error: 'file and entity required' }, { status: 400 });
  }
  try {
    const project = await loadProject(PROJECTS_ROOT, slug);
    await writeEntity(project.rootPath, file, entity);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('traversal') || msg.includes('Invalid project slug')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
