import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';

type Node = { name: string; type: 'dir' | 'file'; children?: Node[] };

async function walk(dir: string): Promise<Node[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nodes: Node[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'manifest.yaml') continue;
    if (e.isDirectory()) {
      nodes.push({ name: e.name, type: 'dir', children: await walk(path.join(dir, e.name)) });
    } else if (e.name.endsWith('.md')) {
      nodes.push({ name: e.name, type: 'file' });
    }
  }
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

export async function GET(_: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  // Validate slug to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ tree: [] }, { status: 400 });
  }
  const root = path.join(PROJECTS_ROOT, slug);
  try {
    return NextResponse.json({ tree: await walk(root) });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ tree: [] });
    }
    return NextResponse.json({ tree: [], error: (err as Error).message }, { status: 500 });
  }
}
