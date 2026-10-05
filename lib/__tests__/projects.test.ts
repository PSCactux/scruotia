import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProject, listProjects, loadProject } from '../projects';

let root: string;

beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'scruotia-proj-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('projects', () => {
  it('creates a project with manifest and initial folder structure', async () => {
    const project = await createProject(root, {
      title: 'Mi Primera Novela',
      methodology: 'snowflake',
      genre: 'generic',
    });
    expect(project.slug).toBe('mi-primera-novela');
    expect(project.manifest.title).toBe('Mi Primera Novela');
    expect(project.manifest.methodology).toBe('snowflake');
    expect(project.manifest.currentStep).toBe('step-01-logline');
  });

  it('lists existing projects', async () => {
    await createProject(root, { title: 'A', methodology: 'snowflake', genre: 'generic' });
    await createProject(root, { title: 'B', methodology: 'snowflake', genre: 'generic' });
    const list = await listProjects(root);
    expect(list).toHaveLength(2);
  });

  it('loads a project by slug', async () => {
    await createProject(root, { title: 'Test Project', methodology: 'snowflake', genre: 'generic' });
    const loaded = await loadProject(root, 'test-project');
    expect(loaded.manifest.title).toBe('Test Project');
  });

  it('rejects path-traversal slug attempts on load', async () => {
    await expect(loadProject(root, '../escape')).rejects.toThrow(/Invalid project slug/);
    await expect(loadProject(root, '..')).rejects.toThrow(/Invalid project slug/);
    await expect(loadProject(root, '/etc/passwd')).rejects.toThrow(/Invalid project slug/);
  });

  it('rejects empty-slugifying titles', async () => {
    await expect(createProject(root, { title: '!!!', methodology: 'snowflake', genre: 'generic' }))
      .rejects.toThrow(/Invalid project slug/);
  });
});
