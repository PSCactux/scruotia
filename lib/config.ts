import path from 'node:path';

/**
 * Where project folders live. Defaults to `./projects` next to the app;
 * set SKRIPTIA_PROJECTS_DIR to keep your stories somewhere else.
 */
export const PROJECTS_ROOT = process.env.SKRIPTIA_PROJECTS_DIR
  ? path.resolve(process.env.SKRIPTIA_PROJECTS_DIR)
  : path.join(process.cwd(), 'projects');
