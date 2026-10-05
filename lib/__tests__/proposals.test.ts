import { describe, it, expect } from 'vitest';
import { extractProposals } from '../proposals';

describe('extractProposals', () => {
  it('extracts a single markdown block', () => {
    const t = 'Aquí va una propuesta:\n\n```markdown\nHola mundo\n```\n\nQué te parece?';
    const out = extractProposals(t);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('Hola mundo');
    expect(out[0].lang).toBe('markdown');
  });

  it('extracts multiple blocks', () => {
    const t = 'A:\n```markdown\nuno\n```\nY también:\n```markdown\ndos\n```';
    expect(extractProposals(t)).toHaveLength(2);
  });

  it('returns empty array when no blocks', () => {
    expect(extractProposals('solo texto sin bloques')).toEqual([]);
  });

  it('handles blocks without lang specifier', () => {
    const t = '```\nsin lenguaje\n```';
    const out = extractProposals(t);
    expect(out).toHaveLength(1);
    expect(out[0].lang).toBeUndefined();
    expect(out[0].content).toBe('sin lenguaje');
  });
});
