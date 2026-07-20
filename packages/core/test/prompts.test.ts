import { describe, expect, it } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import { buildAnalystSystemPrompt } from '../src/ai/personas/analyst.js';
import { buildChatSystemPrompt } from '../src/ai/chat/chat.js';
import {
  ANALYST_ADAPTER_PROMPT,
  ANALYST_RETRY_PROMPT,
  CHAT_DIALOG_RULES,
  CHAT_GATED_RETRY_INSTRUCTION,
  CHAT_GATED_TURN_INSTRUCTION,
  CHAT_SUGGESTIONS_PROMPT,
  COMMENTATOR_PROMPT,
  COMMENTATOR_RETRY_PROMPT,
  deepDiveAdapterPrompt,
  EVENT_FILTER_PROMPT,
} from '../src/ai/runtime/prompts.js';

const DISCIPLINE = '<TRADING-DISCIPLINE>';

function fakeDoc(): ChartDoc {
  return {
    id: 'chart-1',
    schema_version: 2,
    type: 'intraday',
    title: 'MU 短线',
    symbol: 'MU.US',
    created_at: '2026-07-05T14:00:00.000Z',
    updated_at: '2026-07-05T14:00:00.000Z',
    input: { prediction: { direction: 'long', comment: '结构完好' } },
    built: { kind: 'intraday' } as unknown as ChartDoc['built'],
  };
}

describe('assembled system prompts', () => {
  it('keeps agent-authored prompt prose in English', () => {
    expect(buildAnalystSystemPrompt()).toContain("Kansoku's automated short-term reassessment analyst");
    expect(deepDiveAdapterPrompt()).toContain("Kansoku's automated single-stock researcher");
    expect(CHAT_DIALOG_RULES).toContain('Chat discipline:');
    expect(COMMENTATOR_PROMPT).toContain("Kansoku's intraday commentator");
  });

  it('keeps the discipline before the chat prompt and leaves dynamic source data intact', () => {
    const prompt = buildChatSystemPrompt(fakeDoc(), [], DISCIPLINE);
    expect(prompt.indexOf(DISCIPLINE)).toBeLessThan(prompt.indexOf('You are Kansoku'));
    expect(prompt).toContain('Archived prediction:');
  });

  it('keeps mechanical and per-turn instructions in English', () => {
    const prompts = {
      chatSuggestions: CHAT_SUGGESTIONS_PROMPT,
      eventFilter: EVENT_FILTER_PROMPT,
      analystRetry: ANALYST_RETRY_PROMPT,
      commentatorRetry: COMMENTATOR_RETRY_PROMPT,
      chatGatedTurn: CHAT_GATED_TURN_INSTRUCTION,
      chatGatedRetry: CHAT_GATED_RETRY_INSTRUCTION,
    };
    for (const prompt of Object.values(prompts)) {
      expect(prompt).not.toMatch(/[\p{Script=Han}]/u);
    }
  });
});

describe('no restated discipline prose in agent-own prompts', () => {
  const judgmentOwnProse = [
    ANALYST_ADAPTER_PROMPT,
    deepDiveAdapterPrompt(),
    CHAT_DIALOG_RULES,
    CHAT_GATED_TURN_INSTRUCTION,
  ];

  it('cites TD rule IDs instead of copying rule bodies', () => {
    for (const prose of judgmentOwnProse) {
      expect(prose).not.toContain('supported / partial / contradicted');
      expect(prose).not.toContain('只做美股');
      expect(prose).not.toContain('不要臆造数据');
    }
  });
});
