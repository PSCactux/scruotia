// All protocol regexes accept 2 or more `<` and `>` markers — the canonical
// form is 3 but tolerating less avoids silent drops when the model emits
// `<<PATCH:…>>` instead of `<<<PATCH:…>>>`.
// Legacy single-target block: <<<DOC>>>...<<<END>>>
const LEGACY_DOC_RE = /<{2,}\s*DOC\s*>{2,}([\s\S]*?)<{2,}\s*END\s*>{2,}/g;
// Multi-target block: <<<DOC:artifact-id>>>...<<<END>>>
const TARGETED_DOC_RE = /<{2,}\s*DOC\s*:\s*([a-z0-9-]+)\s*>{2,}([\s\S]*?)<{2,}\s*END\s*>{2,}/g;
// Fact block: <<<FACT>>>fact line<<<END>>>
const FACT_RE = /<{2,}\s*FACT\s*>{2,}([\s\S]*?)<{2,}\s*END\s*>{2,}/g;

// Entity-graph protocol (chat-centric flow). Tolerant to whitespace around
// the colons because the model frequently inserts spaces:
//   <<<CARD:type:slug>>>name=Human Name\nicon=👤\n---\nmarkdown body<<<END>>>
//     creates or updates an entity. The optional header (key=value lines)
//     ends with a "---" separator; everything after is the body.
//   <<<LINK:from-type/from-slug:to-type/to-slug:label>>><<<END>>>
//     creates a relationship between two entities.
//   <<<DELETE:type/slug>>><<<END>>>
//     removes an entity.
//   <<<SUGGEST>>>prompt text<<<END>>>
//     proposes a follow-up prompt the UI surfaces as a one-click button.
//
// Identifiers are normalized — anything in the type/slug position gets
// lowercased and non-[a-z0-9] chars collapsed to dashes, so the AI can write
// "Mara", "Mara_y_Tito", or "MARA Y TITO" and we still route it
// correctly.
// Identifier character class: anything except the separator chars we use
// inside the protocol header (`:`, `/`, `<`, `>`, newline). This is permissive
// on purpose — the AI sometimes writes "Mara y Tito" or "Faro". We collapse
// to safe filesystem-friendly form via normalizeId() right after matching.
const ID_CC = '[^:/<>\\n]+?';
const REF_CC = `[^:/<>\\n]+?\\/[^:/<>\\n]+?`;
// ──────── LEGACY <<<…>>> protocol ────────
// Tolerant to `<<` and `>>` (2 or more) in case the model emits less than 3.
// Kept as fallback so old conversations + occasional model regressions still
// work; new prompts teach the fence syntax below.
const CARD_RE = new RegExp(`<{2,}\\s*CARD\\s*:\\s*(${ID_CC})\\s*:\\s*(${ID_CC})\\s*>{2,}([\\s\\S]*?)<{2,}\\s*END\\s*>{2,}`, 'g');
const PATCH_RE = new RegExp(`<{2,}\\s*PATCH\\s*:\\s*(${ID_CC})\\s*:\\s*(${ID_CC})\\s*>{2,}([\\s\\S]*?)<{2,}\\s*END\\s*>{2,}`, 'g');
const LINK_RE = new RegExp(`<{2,}\\s*LINK\\s*:\\s*(${REF_CC})\\s*:\\s*(${REF_CC})(?:\\s*:\\s*([^<>]*?))?\\s*>{2,}(?:[\\s\\S]*?)<{2,}\\s*END\\s*>{2,}`, 'g');
const DELETE_RE = new RegExp(`<{2,}\\s*DELETE\\s*:\\s*(${ID_CC})\\s*\\/\\s*(${ID_CC})\\s*>{2,}(?:[\\s\\S]*?)<{2,}\\s*END\\s*>{2,}`, 'g');
const SUGGEST_RE = /<{2,}\s*SUGGEST\s*>{2,}([\s\S]*?)<{2,}\s*END\s*>{2,}/g;

// ──────── NEW fenced protocol (preferred) ────────
// Markdown-style fences with `~~~` (tildes). Less collision-prone than `<<<`
// because models emit fenced blocks natively and consistently. The body of
// each fence may contain anything except a line starting with `~~~`.
//
// Examples:
//   ~~~scruotia-card personaje:mara
//   name=Mara
//   icon=🧭
//   ---
//   markdown body
//   ~~~
//
//   ~~~scruotia-patch personaje:mara
//   Want=Que la dejen en paz
//   Need=Soltar el luto
//   ~~~
//
//   ~~~scruotia-link personaje/mara lugar/faro
//   label=vive en
//   ~~~
//
//   ~~~scruotia-delete personaje/x
//   ~~~
//
//   ~~~scruotia-fact
//   Mara tiene 64 años cuando empieza la novela.
//   ~~~
//
//   ~~~scruotia-suggest
//   ¿Qué tipo de antagonista?
//   - humano cercano
//   - fuerza natural
//   ~~~
const FENCE_RE = /(?:^|\n)\s*~~~\s*scruotia-(card|patch|link|delete|fact|suggest)\b([^\n]*)\n?([\s\S]*?)\n?\s*~~~(?=\s*(?:\n|$))/g;

function normalizeId(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeRef(raw: string): string {
  const [a, b] = raw.split('/');
  if (!a || !b) return '';
  return `${normalizeId(a)}/${normalizeId(b)}`;
}

/**
 * Legacy single-target extractor — used by inline-edit flows that still
 * speak the unscoped <<<DOC>>> protocol.
 */
export function extractDocUpdate(text: string): { content: string | null; cleanedText: string } {
  const matches = [...text.matchAll(LEGACY_DOC_RE)];
  if (matches.length === 0) return { content: null, cleanedText: text };
  const last = matches[matches.length - 1];
  const content = last[1].trim();
  const cleanedText = text.replace(LEGACY_DOC_RE, '').trim();
  return { content, cleanedText };
}

/**
 * Project-level extractor used by the new chat-centric flow. The assistant
 * may emit any combination of:
 *   <<<DOC:step-01-logline>>>...<<<END>>>    — target a specific artifact
 *   <<<FACT>>>...<<<END>>>                   — append to project memory
 * Returns the docs (keyed by last block per artifact id) plus appended fact
 * lines, and the chat text stripped of all blocks.
 */
export function extractProjectUpdates(text: string): {
  docs: Map<string, string>;
  facts: string[];
  cleanedText: string;
} {
  const docs = new Map<string, string>();
  for (const m of text.matchAll(TARGETED_DOC_RE)) {
    docs.set(m[1], m[2].trim());
  }

  const facts: string[] = [];
  for (const m of text.matchAll(FACT_RE)) {
    const f = m[1].trim();
    if (f) facts.push(f);
  }

  const cleanedText = text
    .replace(TARGETED_DOC_RE, '')
    .replace(FACT_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { docs, facts, cleanedText };
}

export type CardBlock = {
  type: string;
  slug: string;
  attrs: Record<string, string>;
  body: string;
};

export type LinkBlock = {
  from: string; // "type/slug"
  to: string;   // "type/slug"
  label?: string;
};

export type DeleteBlock = {
  type: string;
  slug: string;
};

/**
 * Per-field patch block: merges a subset of fields into the existing body
 * without disturbing the rest. Use sentinels __intro / __pendiente /
 * __trailing for non-bullet content. Applied via mergeBody() in lib/body-fields.
 *
 *   <<<PATCH:personaje:mara>>>
 *   want=Una amiga otra vez
 *   need=Aceptar que el cariño no se exige
 *   __intro=La compañera que parecía amenaza
 *   <<<END>>>
 *
 * Multi-line values are supported via a heredoc-style block delimited by
 * `<<<` and `>>>` on their own lines:
 *
 *   backstory=<<<
 *   Multiple lines
 *   of backstory text.
 *   >>>
 */
export type PatchBlock = {
  type: string;
  slug: string;
  fields: Record<string, string>;
};

export type Suggestion = {
  /** The question or topic the AI is proposing. Shown as the button label. */
  question: string;
  /** Optional inline answer choices the user can pick from. */
  options?: string[];
};

/**
 * Splits a SUGGEST block body into the question (first non-empty line) and
 * its optional bullet-list options. Bullets may start with "-", "*", or "•".
 * Lines without a bullet prefix get appended to the question text so the AI
 * can naturally write multi-line questions.
 */
function parseSuggestion(raw: string): Suggestion {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const questionLines: string[] = [];
  const options: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[-*•]\s+(.+)$/);
    if (m) options.push(m[1].trim());
    else if (options.length === 0) questionLines.push(line);
    // bullets after the question lock the question text — extra non-bullet
    // lines after that are ignored to keep the shape predictable.
  }
  return {
    question: questionLines.join(' ').trim(),
    options: options.length > 0 ? options : undefined,
  };
}

/**
 * Parse the entity-graph protocol from an assistant message. CARD/LINK/DELETE
 * /SUGGEST blocks are stripped from the cleanedText so the chat UI never shows
 * them. FACT blocks are also collected here for convenience (the entity flow
 * keeps facts.md as the project memory).
 *
 * Type and slug identifiers are normalized through normalizeId so the model
 * can write loose forms (camelCase, spaces, accents) and we still route them.
 */
/**
 * Parse a PATCH body into a key→value field map. Supports:
 *   key=value             (single-line)
 *   key=<<<…>>>           (multi-line heredoc, newlines preserved)
 */
function parsePatchFields(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const eq = line.indexOf('=');
    if (eq === -1) { i++; continue; }
    const key = line.slice(0, eq).trim();
    if (!key) { i++; continue; }
    const after = line.slice(eq + 1);
    if (/^<{2,}$/.test(after.trim())) {
      const collected: string[] = [];
      i++;
      while (i < lines.length && !/^>{2,}$/.test(lines[i].trim())) {
        collected.push(lines[i]);
        i++;
      }
      out[key] = collected.join('\n');
      i++; // skip the closing >>>
    } else {
      out[key] = after.trim();
      i++;
    }
  }
  return out;
}

export function extractEntityUpdates(text: string): {
  cards: CardBlock[];
  patches: PatchBlock[];
  links: LinkBlock[];
  deletes: DeleteBlock[];
  facts: string[];
  suggestions: Suggestion[];
  cleanedText: string;
} {
  const cards: CardBlock[] = [];
  for (const m of text.matchAll(CARD_RE)) {
    const type = normalizeId(m[1]);
    const slug = normalizeId(m[2]);
    if (!type || !slug) continue;
    const raw = m[3].trim();
    const sepIdx = raw.indexOf('\n---');
    let attrsBlock = '';
    let body = raw;
    if (sepIdx !== -1) {
      attrsBlock = raw.slice(0, sepIdx).trim();
      body = raw.slice(sepIdx + 4).replace(/^\s*\n/, '').trimEnd();
    }
    const attrs: Record<string, string> = {};
    if (attrsBlock) {
      for (const line of attrsBlock.split('\n')) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim().toLowerCase();
        const value = line.slice(eq + 1).trim();
        if (key) attrs[key] = value;
      }
    }
    cards.push({ type, slug, attrs, body });
  }

  const patches: PatchBlock[] = [];
  for (const m of text.matchAll(PATCH_RE)) {
    const type = normalizeId(m[1]);
    const slug = normalizeId(m[2]);
    if (!type || !slug) continue;
    const fields = parsePatchFields(m[3].trim());
    if (Object.keys(fields).length === 0) continue;
    patches.push({ type, slug, fields });
  }

  const links: LinkBlock[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    const from = normalizeRef(m[1]);
    const to = normalizeRef(m[2]);
    if (!from || !to) continue;
    links.push({ from, to, label: m[3]?.trim() || undefined });
  }

  const deletes: DeleteBlock[] = [];
  for (const m of text.matchAll(DELETE_RE)) {
    const type = normalizeId(m[1]);
    const slug = normalizeId(m[2]);
    if (!type || !slug) continue;
    deletes.push({ type, slug });
  }

  const facts: string[] = [];
  for (const m of text.matchAll(FACT_RE)) {
    const f = m[1].trim();
    if (f) facts.push(f);
  }

  const suggestions: Suggestion[] = [];
  for (const m of text.matchAll(SUGGEST_RE)) {
    const raw = m[1].trim();
    if (!raw) continue;
    suggestions.push(parseSuggestion(raw));
  }

  // ──────── Fenced protocol (preferred since v4) ────────
  // Each fence carries its kind and an "args" string after the kind. Args
  // format depends on the kind (see comment on FENCE_RE).
  for (const m of text.matchAll(FENCE_RE)) {
    const kind = m[1] as 'card' | 'patch' | 'link' | 'delete' | 'fact' | 'suggest';
    const args = (m[2] ?? '').trim();
    const body = m[3];

    if (kind === 'card') {
      // args = "type:slug"
      const [rawType, rawSlug] = args.split(':');
      const type = normalizeId(rawType ?? '');
      const slug = normalizeId(rawSlug ?? '');
      if (!type || !slug) continue;
      const trimmed = body.trim();
      const sepIdx = trimmed.indexOf('\n---');
      let attrsBlock = '';
      let cardBody = trimmed;
      if (sepIdx !== -1) {
        attrsBlock = trimmed.slice(0, sepIdx).trim();
        cardBody = trimmed.slice(sepIdx + 4).replace(/^\s*\n/, '').trimEnd();
      }
      const attrs: Record<string, string> = {};
      if (attrsBlock) {
        for (const line of attrsBlock.split('\n')) {
          const eq = line.indexOf('=');
          if (eq === -1) continue;
          const key = line.slice(0, eq).trim().toLowerCase();
          const value = line.slice(eq + 1).trim();
          if (key) attrs[key] = value;
        }
      }
      cards.push({ type, slug, attrs, body: cardBody });
    } else if (kind === 'patch') {
      // args = "type:slug"
      const [rawType, rawSlug] = args.split(':');
      const type = normalizeId(rawType ?? '');
      const slug = normalizeId(rawSlug ?? '');
      if (!type || !slug) continue;
      const fields = parsePatchFields(body.trim());
      if (Object.keys(fields).length === 0) continue;
      patches.push({ type, slug, fields });
    } else if (kind === 'link') {
      // args = "from-type/from-slug to-type/to-slug" (space-separated)
      const parts = args.split(/\s+/).filter(Boolean);
      const from = normalizeRef(parts[0] ?? '');
      const to = normalizeRef(parts[1] ?? '');
      if (!from || !to) continue;
      // Body may contain `label=...`
      const labelMatch = body.match(/^\s*label\s*=\s*(.+?)\s*$/m);
      links.push({ from, to, label: labelMatch?.[1].trim() || undefined });
    } else if (kind === 'delete') {
      // args = "type/slug" (or body has it)
      const ref = args || body.trim();
      const [rawType, rawSlug] = ref.split('/');
      const type = normalizeId(rawType ?? '');
      const slug = normalizeId(rawSlug ?? '');
      if (!type || !slug) continue;
      deletes.push({ type, slug });
    } else if (kind === 'fact') {
      const f = body.trim();
      if (f) facts.push(f);
    } else if (kind === 'suggest') {
      const raw = body.trim();
      if (raw) suggestions.push(parseSuggestion(raw));
    }
  }

  const cleanedText = text
    .replace(CARD_RE, '')
    .replace(PATCH_RE, '')
    .replace(LINK_RE, '')
    .replace(DELETE_RE, '')
    .replace(FACT_RE, '')
    .replace(SUGGEST_RE, '')
    .replace(FENCE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cards, patches, links, deletes, facts, suggestions, cleanedText };
}
