import matter from 'gray-matter';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type EntityStatus = 'stub' | 'drafting' | 'defined' | 'locked';

export type Entity = {
  id: string;
  type: string;
  status: EntityStatus;
  summary: string;
  body: string;
  related: string[];
  [key: string]: unknown;
};

function resolveSafe(projectRoot: string, relPath: string): string {
  const rootAbs = path.resolve(projectRoot);
  const target = path.resolve(rootAbs, relPath);
  const rel = path.relative(rootAbs, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${relPath}`);
  }
  return target;
}

export async function readEntity(projectRoot: string, relPath: string): Promise<Entity> {
  const fullPath = resolveSafe(projectRoot, relPath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const parsed = matter(raw);
  return {
    ...parsed.data,
    body: parsed.content,
  } as Entity;
}

export async function writeEntity(projectRoot: string, relPath: string, entity: Entity): Promise<void> {
  const fullPath = resolveSafe(projectRoot, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const { body, ...frontmatter } = entity;
  const content = matter.stringify(body, frontmatter);
  await fs.writeFile(fullPath, content, 'utf-8');
}

export async function listEntities(projectRoot: string, relDir: string): Promise<Entity[]> {
  const fullDir = resolveSafe(projectRoot, relDir);
  let files: string[];
  try {
    files = await fs.readdir(fullDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const mdFiles = files.filter(f => f.endsWith('.md'));
  return Promise.all(mdFiles.map(f => readEntity(projectRoot, path.join(relDir, f))));
}
