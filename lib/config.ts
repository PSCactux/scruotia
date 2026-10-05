import path from 'node:path';

/**
 * Where project folders live. Defaults to `./projects` next to the app;
 * set SCRUOTIA_PROJECTS_DIR to keep your stories somewhere else.
 */
export const PROJECTS_ROOT = process.env.SCRUOTIA_PROJECTS_DIR
  ? path.resolve(process.env.SCRUOTIA_PROJECTS_DIR)
  : path.join(process.cwd(), 'projects');
