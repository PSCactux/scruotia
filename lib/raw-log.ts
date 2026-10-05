/**
 * Raw turn log — persists every assistant/user turn verbatim to disk under
 *   projects/<slug>/99-ai/raw-turns/<ISO>-<role>.md
 *
 * Unlike main.json (which stores cleanedText, with protocol blocks already
 * stripped), this is the UNTOUCHED text so we can forensicate later when
 * something goes wrong — e.g. "why did this character end up with an empty body?"
 *
 * Append-only, never modified. Auto-pruned if it grows beyond 200 files
 * (keeps the most recent 150). Each file has a short YAML frontmatter so
 * `git diff` or a quick grep stays readable.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const RAW_DIR = path.join('99-ai', 'raw-turns');
const KEEP_RECENT = 150;
const PRUNE_AT = 200;

function isoToKey(iso: string): string {
  // Filesystem-safe: replace ':' with '-' (forbidden on Windows).
  return iso.replace(/:/g, '-');
}

/**
 * Write a raw turn to disk. Returns the absolute path written, or null on
 * failure (failures are swallowed — we never want a log error to bubble
 * up and kill a chat response).
 */
export async function logRawTurn(
  projectRoot: string,
  role: 'user' | 'assistant',
  content: string,
  meta: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const dir = path.join(projectRoot, RAW_DIR);
    await fs.mkdir(dir, { recursive: true });
    const ts = new Date().toISOString();
    const file = path.join(dir, `${isoToKey(ts)}-${role}.md`);

    const fmEntries: string[] = [`role: ${role}`, `ts: ${ts}`, `chars: ${content.length}`];
    for (const [k, v] of Object.entries(meta)) {
      // YAML-safe: avoid arbitrary objects, just primitives & strings.
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        fmEntries.push(`${k}: ${JSON.stringify(v)}`);
      }
    }
    const out = `---\n${fmEntries.join('\n')}\n---\n${content}`;
    await fs.writeFile(file, out, 'utf-8');

    // Best-effort prune (don't block on it).
    void pruneRawTurns(projectRoot);

    return file;
  } catch (err) {
    console.error('[raw-log] failed to write turn:', err);
    return null;
  }
}

/**
 * If the directory has more than PRUNE_AT files, keep only the KEEP_RECENT
 * newest. Pure housekeeping — never throws.
 */
async function pruneRawTurns(projectRoot: string): Promise<void> {
  try {
    const dir = path.join(projectRoot, RAW_DIR);
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.md'));
    if (files.length <= PRUNE_AT) return;
    files.sort(); // ISO timestamp sorts chronologically
    const toRemove = files.slice(0, files.length - KEEP_RECENT);
    for (const f of toRemove) {
      await fs.unlink(path.join(dir, f)).catch(() => {});
    }
  } catch {/* ignore */}
}

/** List recent turns (metadata only — does not read content). Newest first. */
export async function listRawTurns(projectRoot: string): Promise<Array<{ ts: string; role: 'user' | 'assistant'; file: string }>> {
  try {
    const dir = path.join(projectRoot, RAW_DIR);
    const files = await fs.readdir(dir);
    const out: Array<{ ts: string; role: 'user' | 'assistant'; file: string }> = [];
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const m = f.match(/^(.+?)-(user|assistant)\.md$/);
      if (!m) continue;
      out.push({
        ts: m[1].replace(/T(\d{2})-(\d{2})-/, 'T$1:$2:'),
        role: m[2] as 'user' | 'assistant',
        file: f,
      });
    }
    return out.sort((a, b) => b.ts.localeCompare(a.ts));
  } catch {
    return [];
  }
}
