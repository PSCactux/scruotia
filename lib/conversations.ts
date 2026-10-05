import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ConvSuggestion = {
  question: string;
  options?: string[];
};

export type ConvMessage = {
  role: 'user' | 'assistant';
  content: string;
  ts?: string;
  focusArtifact?: string | null;
  /**
   * AI-proposed follow-up prompts. Each can carry inline answer options so
   * the UI opens an "elige una opción o escribe la tuya" chooser instead of
   * sending the question raw. Legacy string entries (pre-options) are kept
   * compatible by the renderer.
   */
  suggestions?: Array<ConvSuggestion | string>;
  /** "type/slug" of entities the assistant just created or updated. */
  touched?: string[];
};
export type Conversation = { messages: ConvMessage[] };

const STEP_ID_RE = /^[a-z0-9-]+$/;

function legacyPathFor(projectRoot: string, stepId: string): string {
  if (!STEP_ID_RE.test(stepId)) {
    throw new Error(`Invalid stepId: ${stepId}`);
  }
  return path.join(projectRoot, '99-ai', 'conversations', `${stepId}.json`);
}

function mainPathFor(projectRoot: string): string {
  return path.join(projectRoot, '99-ai', 'main.json');
}

/**
 * Load the project-level conversation. If `main.json` doesn't exist yet but
 * legacy per-step conversations do, merge them into a single ordered stream
 * (using the optional stepOrder to interleave by step) and persist that as
 * the new canonical conversation.
 */
export async function loadMainConversation(
  projectRoot: string,
  stepOrder?: string[],
): Promise<Conversation> {
  const file = mainPathFor(projectRoot);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Conversation;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Fallback: migrate from legacy per-step files.
  const merged = await migrateFromLegacy(projectRoot, stepOrder);
  if (merged.messages.length > 0) {
    await saveMainConversation(projectRoot, merged);
  }
  return merged;
}

export async function saveMainConversation(projectRoot: string, conv: Conversation): Promise<void> {
  const file = mainPathFor(projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(conv, null, 2), 'utf-8');
}

async function migrateFromLegacy(projectRoot: string, stepOrder?: string[]): Promise<Conversation> {
  const dir = path.join(projectRoot, '99-ai', 'conversations');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { messages: [] };
  }

  const stepFiles = entries.filter(f => f.endsWith('.json'));
  // Sort: if stepOrder is provided, follow it; unknown steps go alphabetically at the end.
  stepFiles.sort((a, b) => {
    const aId = a.replace(/\.json$/, '');
    const bId = b.replace(/\.json$/, '');
    if (stepOrder) {
      const ai = stepOrder.indexOf(aId);
      const bi = stepOrder.indexOf(bId);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
    }
    return aId.localeCompare(bId);
  });

  const merged: ConvMessage[] = [];
  for (const file of stepFiles) {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8');
      const conv = JSON.parse(raw) as Conversation;
      const stepId = file.replace(/\.json$/, '');
      for (const m of conv.messages) {
        merged.push({ ...m, focusArtifact: m.focusArtifact ?? stepId });
      }
    } catch {/* skip unreadable */}
  }
  return { messages: merged };
}

// Legacy helpers retained for any callers still on per-step convos.
export async function loadConversation(projectRoot: string, stepId: string): Promise<Conversation> {
  const filePath = legacyPathFor(projectRoot, stepId);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Conversation;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { messages: [] };
    throw err;
  }
}

export async function saveConversation(projectRoot: string, stepId: string, conv: Conversation): Promise<void> {
  const filePath = legacyPathFor(projectRoot, stepId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(conv, null, 2), 'utf-8');
}
