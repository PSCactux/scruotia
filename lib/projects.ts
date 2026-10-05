import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export type Manifest = {
  title: string;
  methodology: string;
  genre: string;
  currentStep: string;
  createdAt: string;
  lockedSteps?: string[];
};

export type Project = {
  slug: string;
  manifest: Manifest;
  rootPath: string;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid project slug: ${slug}`);
  }
}

export async function createProject(root: string, opts: { title: string; methodology: string; genre: string }): Promise<Project> {
  const slug = slugify(opts.title);
  validateSlug(slug);
  const rootPath = path.join(root, slug);
  await fs.mkdir(rootPath, { recursive: true });

  const manifest: Manifest = {
    title: opts.title,
    methodology: opts.methodology,
    genre: opts.genre,
    currentStep: 'step-01-logline',
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(rootPath, 'manifest.yaml'), yaml.dump(manifest), 'utf-8');

  for (const sub of ['00-premise', '01-world', '02-characters', '03-structure', '04-plot', '99-ai']) {
    await fs.mkdir(path.join(rootPath, sub), { recursive: true });
  }

  return { slug, manifest, rootPath };
}

export async function listProjects(root: string): Promise<Project[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
    return Promise.all(dirs.map(d => loadProject(root, d.name)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function loadProject(root: string, slug: string): Promise<Project> {
  validateSlug(slug);
  const rootPath = path.join(root, slug);
  const raw = await fs.readFile(path.join(rootPath, 'manifest.yaml'), 'utf-8');
  const manifest = yaml.load(raw) as Manifest;
  return { slug, manifest, rootPath };
}

export async function updateManifest(project: Project, patch: Partial<Manifest>): Promise<void> {
  const next = { ...project.manifest, ...patch };
  await fs.writeFile(path.join(project.rootPath, 'manifest.yaml'), yaml.dump(next), 'utf-8');
}
