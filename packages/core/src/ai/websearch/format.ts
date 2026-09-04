import type { SearchResponse } from './types.js';

const SNIPPET_MAX_CHARS = 240;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function formatForLlm(response: SearchResponse): string {
  const parts: string[] = [];
  if (response.answer?.trim()) {
    parts.push(response.answer.trim());
  } else if (response.sources.length > 0) {
    parts.push(
      'This backend returns raw search hits, not a written answer. Read the snippets below and draw the conclusion yourself.',
    );
  }

  if (response.sources.length > 0) {
    parts.push('\n## Sources');
    for (const [index, source] of response.sources.entries()) {
      const date = source.publishedDate ? ` (${source.publishedDate})` : '';
      parts.push(`[${index + 1}] ${source.title}${date}\n    ${source.url}`);
      if (source.snippet) parts.push(`    ${truncate(source.snippet, SNIPPET_MAX_CHARS)}`);
    }
  }

  parts.push(`\n(via ${response.provider})`);
  return parts.join('\n');
}
