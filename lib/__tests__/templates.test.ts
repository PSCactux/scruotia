import { describe, it, expect } from 'vitest';
import { loadMethodology, getStep } from '../templates';

describe('templates', () => {
  it('loads Snowflake methodology with 10 steps', async () => {
    const m = await loadMethodology('snowflake');
    expect(m.id).toBe('snowflake');
    expect(m.steps).toHaveLength(10);
    expect(m.steps[0].id).toBe('step-01-logline');
  });

  it('gets a specific step by id', async () => {
    const step = await getStep('snowflake', 'step-02-paragraph');
    expect(step.order).toBe(2);
    expect(step.output_file).toBe('00-premise/paragraph.md');
    expect(step.prompts_to_ask.length).toBeGreaterThan(0);
  });

  it('includes voice and world steps with correct ui_kinds', async () => {
    const voice = await getStep('snowflake', 'step-voice');
    expect(voice.ui_kind).toBe('voice_style');
    expect(voice.output_file).toBe('00-premise/voice.md');

    const world = await getStep('snowflake', 'step-world');
    expect(world.ui_kind).toBe('world_canon');
    expect(world.output_file).toBe('01-world/_canon.md');
  });
});
