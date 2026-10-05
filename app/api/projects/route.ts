import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject } from '@/lib/projects';
import { PROJECTS_ROOT } from '@/lib/config';

export async function GET() {
  const projects = await listProjects(PROJECTS_ROOT);
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.methodology || !body.genre) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  try {
    const project = await createProject(PROJECTS_ROOT, body);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
