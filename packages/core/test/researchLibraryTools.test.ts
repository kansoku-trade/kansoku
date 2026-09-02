import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildResearchLibraryTools } from '../src/ai/agents/researchLibraryTools.js';
import { saveCanvas } from '../src/canvas/store.js';
import { researchCanvasPath } from '../src/contract/research.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="MU 验收面板" caption="Longbridge · demo"><Text>secret-source</Text></Canvas>;
}
`;

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return (result.content[0] as { text: string }).text;
}

describe('research library tools vs canvases', () => {
  it('can search a canvas and refuses to return its source from read_research_document', async () => {
    const root = mkdtempSync(join(tmpdir(), 'research-library-tools-'));
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source,
    });
    expect(saved.ok).toBe(true);

    const byName = Object.fromEntries(
      buildResearchLibraryTools(root).map((tool) => [tool.name, tool]),
    );
    const found = await byName.search_research_documents.execute('s1', {
      query: '验收面板',
    });
    expect(textOf(found)).toContain('acceptance-mu-panel');

    const read = await byName.read_research_document.execute('s2', {
      path: researchCanvasPath('acceptance-mu-panel'),
    });
    const text = textOf(read);
    expect(text).toMatch(/bash/);
    expect(text).not.toContain('secret-source');
    expect(text).not.toContain('export default');
  });
});
