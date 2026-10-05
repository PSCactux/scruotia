/**
 * Tolerant body parser for entity markdown bodies. The bodies that the AI
 * produces follow the `bodyTemplate` of each entity-type but vary in detail:
 * keys can be Spanish ("Especie", "Rasgo central"), formatted as `- **Key**: v`
 * or `- **Key:** v`, with a free-prose intro before the bullets and/or a
 * trailing "Pendiente: ..." block.
 *
 * v4 needs three operations:
 *   parseBody  — extract intro + bullet fields + ## sections + pendiente
 *   renderBody — turn a BodyFields back into markdown (canonical formatting)
 *   mergeBody  — apply a per-field patch without disturbing the rest
 *
 * Round-trip is canonical, not byte-exact: `renderBody(parseBody(x))` is
 * deterministic but may normalize bullet punctuation. mergeBody preserves
 * fields not present in the patch.
 */

export type Field = { key: string; value: string };
export type Section = { title: string; body: string };

export type BodyFields = {
  /** Free prose before any bullets or ## headings. */
  intro: string;
  /** `- **Key:** value` bullets. */
  fields: Field[];
  /** `## Heading` blocks with their bodies. */
  sections: Section[];
  /** Free prose after the last bullet/section, excluding the Pendiente line. */
  trailingProse: string;
  /** Text of the `**Pendiente:** ...` line, or empty string. */
  pendiente: string;
};

const BULLET_RE = /^[-*]\s+\*\*([^*]+?):?\*\*[:\s]*(.*)$/;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const PENDIENTE_RE = /^\s*\*\*Pendiente:?\*\*\s*(.*)$/i;

/** Normalize a key for comparison: lowercase, no accents, no extra space. */
export function normalizeKey(k: string): string {
  return k
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBody(body: string): BodyFields {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const fields: Field[] = [];
  const sections: Section[] = [];
  const introLines: string[] = [];
  const trailingLines: string[] = [];
  let pendiente = '';

  // First pass: split into intro / bullets / sections / trailing using a
  // simple state machine. The "intro" is everything before the first bullet
  // or ## heading. Subsequent bullets accumulate as fields. ## headings open
  // a section that absorbs lines until the next ## or end.
  type Mode = 'intro' | 'bullets' | 'section' | 'trailing';
  let mode: Mode = 'intro';
  let currentSection: Section | null = null;

  const flushSection = () => {
    if (currentSection) {
      currentSection.body = currentSection.body.replace(/\s+$/, '');
      sections.push(currentSection);
      currentSection = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // Pendiente line wins anywhere — captured and not added elsewhere.
    const pm = line.match(PENDIENTE_RE);
    if (pm) {
      pendiente = pm[1].trim();
      flushSection();
      mode = 'trailing';
      continue;
    }

    const sm = line.match(SECTION_RE);
    if (sm) {
      flushSection();
      currentSection = { title: sm[1].trim(), body: '' };
      mode = 'section';
      continue;
    }

    const bm = line.match(BULLET_RE);
    if (bm) {
      flushSection();
      fields.push({ key: bm[1].trim(), value: bm[2].trim() });
      mode = 'bullets';
      continue;
    }

    if (mode === 'section' && currentSection) {
      currentSection.body += (currentSection.body ? '\n' : '') + line;
      continue;
    }

    if (mode === 'intro') {
      if (line.trim() || introLines.length) introLines.push(line);
      continue;
    }

    // Past bullets, no section open: free trailing prose.
    if (line.trim() || trailingLines.length) trailingLines.push(line);
    mode = 'trailing';
  }
  flushSection();

  return {
    intro: introLines.join('\n').trim(),
    fields,
    sections,
    trailingProse: trailingLines.join('\n').trim(),
    pendiente,
  };
}

/** Re-emit a BodyFields as canonical markdown. */
export function renderBody(parsed: BodyFields): string {
  const parts: string[] = [];
  if (parsed.intro) parts.push(parsed.intro);
  if (parsed.fields.length) {
    parts.push(parsed.fields.map(f => `- **${f.key}:** ${f.value}`).join('\n'));
  }
  for (const s of parsed.sections) {
    parts.push(`## ${s.title}\n${s.body}`.trimEnd());
  }
  if (parsed.trailingProse) parts.push(parsed.trailingProse);
  if (parsed.pendiente) parts.push(`**Pendiente:** ${parsed.pendiente}`);
  return parts.join('\n\n');
}

/**
 * Apply a partial patch of `{ fieldKey: newValue }` to an existing body,
 * preserving every field the patch doesn't mention. Keys are matched
 * case/accent-insensitive against existing fields; new keys are appended at
 * the end of the bullets block.
 *
 * Special patch keys:
 *   `__intro`     → replace the free-prose intro
 *   `__pendiente` → replace the Pendiente line (empty string clears it)
 *   `__trailing`  → replace trailing prose
 *
 * Returns the new markdown body.
 */
export function mergeBody(current: string, patch: Record<string, string>): string {
  const parsed = parseBody(current);
  const fieldIndex = new Map(parsed.fields.map((f, i) => [normalizeKey(f.key), i] as const));

  for (const [rawKey, value] of Object.entries(patch)) {
    if (rawKey === '__intro')     { parsed.intro = value;        continue; }
    if (rawKey === '__pendiente') { parsed.pendiente = value;    continue; }
    if (rawKey === '__trailing')  { parsed.trailingProse = value; continue; }

    const norm = normalizeKey(rawKey);
    const idx = fieldIndex.get(norm);
    if (idx !== undefined) {
      parsed.fields[idx] = { key: parsed.fields[idx].key, value };
    } else {
      parsed.fields.push({ key: rawKey, value });
      fieldIndex.set(norm, parsed.fields.length - 1);
    }
  }

  return renderBody(parsed);
}

/** Convenience: read a single field's value, normalized-key match. */
export function getField(parsed: BodyFields, key: string | RegExp): string {
  if (key instanceof RegExp) {
    return parsed.fields.find(f => key.test(f.key))?.value ?? '';
  }
  const norm = normalizeKey(key);
  return parsed.fields.find(f => normalizeKey(f.key) === norm)?.value ?? '';
}
