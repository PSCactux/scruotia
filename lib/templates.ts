import yaml from 'js-yaml';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type MethodologyStep = {
  id: string;
  order: number;
  title: string;
  instruction: string;
  output_file: string | null;
  output_type: string;
  ui_kind?: 'single_input' | 'paragraph_fields' | 'character_cards' | 'character_bibles' | 'scene_table' | 'voice_style' | 'world_canon' | 'markdown';
  prompts_to_ask: string[];
  validation?: Record<string, unknown>[];
};

export type Methodology = {
  id: string;
  name: string;
  author: string;
  description: string;
  steps: MethodologyStep[];
};

const TEMPLATES_DIR = path.join(process.cwd(), 'templates', 'methodologies');

export async function loadMethodology(id: string): Promise<Methodology> {
  // Validate id to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Invalid methodology id: ${id}`);
  }
  const file = path.join(TEMPLATES_DIR, `${id}.yaml`);
  const raw = await fs.readFile(file, 'utf-8');
  return yaml.load(raw) as Methodology;
}

export async function getStep(methodologyId: string, stepId: string): Promise<MethodologyStep> {
  const m = await loadMethodology(methodologyId);
  const step = m.steps.find(s => s.id === stepId);
  if (!step) throw new Error(`Step ${stepId} not found in ${methodologyId}`);
  return step;
}
