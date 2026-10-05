import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

const FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

async function refsDir(slug: string): Promise<string> {
  const project = await loadProject(PROJECTS_ROOT, slug);
  const dir = path.join(project.rootPath, 'references');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const dir = await refsDir(slug);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const refs = await Promise.all(
      entries
        .filter(e => e.isFile() && !e.name.startsWith('.'))
        .map(async e => {
          const stat = await fs.stat(path.join(dir, e.name));
          return { name: e.name, size: stat.size };
        })
    );
    return NextResponse.json({ references: refs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const { name, content } = (await req.json()) as { name: string; content: string };
    if (!name || !FILENAME_RE.test(name)) {
      return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    }
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    const dir = await refsDir(slug);
    const target = path.resolve(path.join(dir, name));
    if (!target.startsWith(path.resolve(dir) + path.sep)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 });
    }
    await fs.writeFile(target, content, 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const file = req.nextUrl.searchParams.get('file');
  if (!file || !FILENAME_RE.test(file)) {
    return NextResponse.json({ error: 'invalid file' }, { status: 400 });
  }
  try {
    const dir = await refsDir(slug);
    const target = path.resolve(path.join(dir, file));
    if (!target.startsWith(path.resolve(dir) + path.sep)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 });
    }
    await fs.rm(target, { force: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
