import { NextRequest, NextResponse } from 'next/server';
import { loadProject } from '@/lib/projects';
import { upsertEntity, deleteEntity, readEntity, type EntityLink, type EntityStatus } from '@/lib/entities';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const type = req.nextUrl.searchParams.get('type');
  const entitySlug = req.nextUrl.searchParams.get('slug');
  if (!type || !entitySlug) {
    return NextResponse.json({ error: 'type and slug required' }, { status: 400 });
  }
  const project = await loadProject(PROJECTS_ROOT, slug);
  const entity = await readEntity(project.rootPath, type, entitySlug);
  if (!entity) return NextResponse.json({ entity: null });
  return NextResponse.json({ entity });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json()) as {
    type: string;
    slug?: string;
    name?: string;
    body?: string;
    icon?: string;
    status?: EntityStatus;
    links?: EntityLink[];
  };
  if (!body.type) return NextResponse.json({ error: 'type required' }, { status: 400 });
  const project = await loadProject(PROJECTS_ROOT, slug);
  try {
    const entity = await upsertEntity(project.rootPath, body);
    return NextResponse.json({ entity });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const type = req.nextUrl.searchParams.get('type');
  const entitySlug = req.nextUrl.searchParams.get('slug');
  if (!type || !entitySlug) {
    return NextResponse.json({ error: 'type and slug required' }, { status: 400 });
  }
  const project = await loadProject(PROJECTS_ROOT, slug);
  await deleteEntity(project.rootPath, type, entitySlug);
  return NextResponse.json({ ok: true });
}
