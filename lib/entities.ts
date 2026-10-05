import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { snapshotEntity } from './history';

/**
 * An entity is the unit of the new chat-centric outline: a personaje, lugar,
 * escena, etc. Stored as one markdown file per entity at
 *   <projectRoot>/entities/<type>/<slug>.md
 * with frontmatter describing the entity and the body as rich markdown.
 */

export type EntityLink = {
  to: string; // "<type>/<slug>"
  label?: string;
};

export type EntityStatus = 'stub' | 'drafting' | 'defined' | 'locked';

export type Entity = {
  type: string;
  slug: string;
  name: string;
  icon?: string;
  status: EntityStatus;
  links: EntityLink[];
  created: string;
  updated: string;
  body: string;
  // arbitrary extra frontmatter from the AI is allowed
  [k: string]: unknown;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TYPE_RE = /^[a-z][a-z0-9-]*$/;

function entitiesDir(projectRoot: string): string {
  return path.join(projectRoot, 'entities');
}

function fileFor(projectRoot: string, type: string, slug: string): string {
  if (!TYPE_RE.test(type)) throw new Error(`invalid entity type: ${type}`);
  if (!SLUG_RE.test(slug)) throw new Error(`invalid entity slug: ${slug}`);
  return path.join(entitiesDir(projectRoot), type, `${slug}.md`);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^-/, '')
    || 'sin-nombre';
}

export async function readEntity(projectRoot: string, type: string, slug: string): Promise<Entity | null> {
  try {
    const raw = await fs.readFile(fileFor(projectRoot, type, slug), 'utf-8');
    const parsed = matter(raw);
    return {
      type,
      slug,
      name: (parsed.data.name as string) ?? slug,
      icon: parsed.data.icon as string | undefined,
      status: ((parsed.data.status as EntityStatus) ?? 'drafting'),
      links: (parsed.data.links as EntityLink[]) ?? [],
      created: (parsed.data.created as string) ?? new Date().toISOString(),
      updated: (parsed.data.updated as string) ?? new Date().toISOString(),
      body: parsed.content.trim(),
      ...parsed.data,
    } as Entity;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeEntity(
  projectRoot: string,
  entity: Entity,
  opts: { snapshotReason?: string } = {},
): Promise<void> {
  const filePath = fileFor(projectRoot, entity.type, entity.slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Snapshot the previous version (if any) BEFORE we overwrite. No-op for
  // brand-new entities. Reason defaults to 'edit'; callers can override.
  await snapshotEntity(projectRoot, entity.type, entity.slug, opts.snapshotReason ?? 'edit');
  const { body, type: _t, slug: _s, ...rest } = entity;
  void _t; void _s;
  // gray-matter / js-yaml chokes on `undefined` values — strip them before
  // dumping. Empty strings, arrays, and null are allowed.
  const frontmatter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) frontmatter[k] = v;
  }
  frontmatter.updated = new Date().toISOString();
  if (!frontmatter.created) frontmatter.created = frontmatter.updated;
  const content = matter.stringify(body, frontmatter);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function deleteEntity(
  projectRoot: string,
  type: string,
  slug: string,
  opts: { snapshotReason?: string } = {},
): Promise<void> {
  // Snapshot before delete so the user can undo even after the file is gone.
  await snapshotEntity(projectRoot, type, slug, opts.snapshotReason ?? 'delete');
  try {
    await fs.rm(fileFor(projectRoot, type, slug), { force: true });
  } catch {/* ignore */}
}

/**
 * Lists all entities across all types in the project's entities/ tree.
 * Returns them grouped by type, ordered by `updated` desc within each group.
 */
export async function listEntities(projectRoot: string): Promise<Entity[]> {
  const root = entitiesDir(projectRoot);
  const out: Entity[] = [];
  let typeDirs: string[] = [];
  try {
    typeDirs = (await fs.readdir(root, { withFileTypes: true }))
      .filter(d => d.isDirectory() && TYPE_RE.test(d.name))
      .map(d => d.name);
  } catch {
    return out;
  }
  for (const type of typeDirs) {
    let files: string[] = [];
    try {
      files = (await fs.readdir(path.join(root, type)))
        .filter(f => f.endsWith('.md'));
    } catch { continue; }
    for (const file of files) {
      const slug = file.replace(/\.md$/, '');
      if (!SLUG_RE.test(slug)) continue;
      const e = await readEntity(projectRoot, type, slug);
      if (e) out.push(e);
    }
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (b.updated ?? '').localeCompare(a.updated ?? '');
  });
  return out;
}

/**
 * Upserts an entity: if name/slug missing, derives slug from name. Preserves
 * existing frontmatter (links/status/created) when updating.
 */
export async function upsertEntity(
  projectRoot: string,
  patch: { type: string; slug?: string; name?: string; body?: string; icon?: string; links?: EntityLink[]; status?: EntityStatus; [k: string]: unknown },
  opts: { snapshotReason?: string } = {},
): Promise<Entity> {
  const slug = patch.slug ?? slugify(patch.name ?? '');
  if (!slug) throw new Error('entity needs name or slug');
  const existing = await readEntity(projectRoot, patch.type, slug);
  const now = new Date().toISOString();
  const entity: Entity = {
    type: patch.type,
    slug,
    name: patch.name ?? existing?.name ?? slug,
    icon: patch.icon ?? existing?.icon,
    status: patch.status ?? existing?.status ?? 'drafting',
    links: patch.links ?? existing?.links ?? [],
    created: existing?.created ?? now,
    updated: now,
    body: patch.body ?? existing?.body ?? '',
  };
  // Pass through any extra fields (e.g. ai-set metadata).
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in entity)) (entity as Record<string, unknown>)[k] = v;
  }
  await writeEntity(projectRoot, entity, opts);
  return entity;
}
