export type Proposal = { content: string; lang?: string };

export function extractProposals(text: string): Proposal[] {
  const out: Proposal[] = [];
  const re = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ content: m[2].trimEnd(), lang: m[1] });
  }
  return out;
}
