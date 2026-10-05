import { describe, it, expect } from 'vitest';
import { streamChat } from '../claude';

// Skipped by default: this test spawns the real Claude Code CLI and requires
// an active OAuth session at `~/.claude/`. It is here as documented smoke
// coverage; un-skip locally when verifying the wrapper end-to-end.
describe.skip('claude streaming (skipped — requires OAuth session)', () => {
  it('streams a response to a simple prompt', async () => {
    const out: string[] = [];
    for await (const chunk of streamChat({
      systemPrompt: 'Responde brevemente en una sola palabra.',
      messages: [{ role: 'user', content: 'Hola' }],
    })) {
      out.push(chunk);
    }
    expect(out.join('')).toMatch(/.+/);
  }, 30000);
});
