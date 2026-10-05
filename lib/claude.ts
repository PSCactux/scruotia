import { query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Minimal chat message shape used by the Scruotia wrapper. Maps directly to
 * the role/content pair that the Claude Agent SDK accepts when serialized
 * into a single prompt string.
 */
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Default model. Can be overridden per call.
 *
 * Pinning to a specific Claude model id keeps behavior consistent across the
 * MVP — change here (or pass an explicit `model`) when upgrading.
 */
const DEFAULT_MODEL = 'claude-opus-4-7';

/**
 * Serialize a conversation history into a single prompt string suitable for
 * the `prompt: string` form of the Claude Agent SDK's `query()`.
 *
 * The SDK also supports an `AsyncIterable<SDKUserMessage>` for true
 * streaming-input mode, but for a stateless per-request wrapper a serialized
 * transcript is simpler and produces equivalent results since `systemPrompt`
 * already carries the persistent instructions.
 */
function serializeHistory(messages: ChatMessage[]): string {
  // If there's only one user turn, return its content verbatim so the model
  // sees the message exactly as the user wrote it (no chrome / framing).
  if (messages.length === 1 && messages[0].role === 'user') {
    return messages[0].content;
  }

  const lines: string[] = [];
  for (const m of messages) {
    const label = m.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${label}: ${m.content}`);
  }
  // Trailing cue so the model knows it's its turn to speak next.
  lines.push('Assistant:');
  return lines.join('\n\n');
}

/**
 * Stream a chat completion from Claude using the Agent SDK with OAuth.
 *
 * Authentication is picked up automatically from the local Claude Code
 * session at `~/.claude/` — there is no API key. The user must have run
 * `claude login` at least once for the host CLI to have valid credentials.
 *
 * Yields text chunks (token deltas when available, otherwise complete text
 * blocks) as the model streams its response.
 */
export async function* streamChat(opts: {
  systemPrompt: string;
  messages: ChatMessage[];
  model?: string;
}): AsyncGenerator<string> {
  const prompt = serializeHistory(opts.messages);

  const result = query({
    prompt,
    options: {
      systemPrompt: opts.systemPrompt,
      model: opts.model ?? DEFAULT_MODEL,
      // Emit per-token deltas so we can stream incrementally to the client
      // instead of yielding the entire assistant message at once.
      includePartialMessages: true,
      // This is a chat wrapper, not a code agent — disable all built-in
      // tools so the model just answers in text.
      tools: [],
    },
  });

  for await (const msg of result) {
    switch (msg.type) {
      case 'stream_event': {
        // Partial assistant message — yield text deltas as they arrive.
        const ev = msg.event;
        if (
          ev.type === 'content_block_delta' &&
          ev.delta.type === 'text_delta'
        ) {
          yield ev.delta.text;
        }
        break;
      }
      case 'assistant': {
        // Final assistant message. When partial-message streaming is enabled
        // every text delta has already been yielded above, so we don't
        // re-emit the complete content blocks here to avoid duplication.
        if (msg.error) {
          throw new Error(`Claude assistant error: ${msg.error}`);
        }
        break;
      }
      case 'result': {
        // Terminal event — nothing to yield.
        break;
      }
      case 'system':
      case 'user':
        break;
      default: {
        // Log unexpected event types to aid debugging without breaking the
        // stream. The SDK emits many ancillary events (hooks, tool progress,
        // notifications) we intentionally ignore.
        if (process.env.DEBUG_CLAUDE_SDK) {
          console.error('[claude] unhandled SDK event:', msg.type);
        }
      }
    }
  }
}
