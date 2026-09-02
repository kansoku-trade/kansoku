// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('gsap', () => ({
  gsap: {
    killTweensOf: vi.fn(),
    set: vi.fn(),
    fromTo: vi.fn(),
  },
}));

vi.mock('../cockpit/chat/useChatSession', () => ({
  useAssistantChatSession: () => ({
    session: {
      id: 'chat-1',
      title: '画布：MU 验收面板',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      busy: false,
      messageCount: 0,
      preview: null,
    },
    rows: [],
    busy: false,
    aborting: false,
    streamText: '',
    liveTools: [],
    liveBeats: [],
    hint: null,
    loaded: true,
    suggestions: [],
    usage: null,
    send: vi.fn(),
    retryLast: vi.fn(),
    abort: vi.fn(),
    ensureSuggestions: vi.fn(),
  }),
}));

vi.mock('../canvas/CanvasSplit', () => ({
  CanvasSplit: ({ children, openSlug }: { children: ReactNode; openSlug: string | null }) => (
    <div>
      {children}
      {openSlug ? <iframe title="canvas" /> : null}
    </div>
  ),
}));

const { AssistantConversation } = await import('./AssistantConversation');

const canvasPath = 'journal/canvases/acceptance-mu-panel.canvas.tsx';

function renderConversation() {
  return render(
    <AssistantConversation
      sessionId="chat-1"
      sessionTitle="画布：MU 验收面板"
      refreshSessions={() => {}}
      mentionCandidates={[{ path: canvasPath, title: 'MU 验收面板' }]}
      linkedCanvas={{ path: canvasPath, title: 'MU 验收面板' }}
      modelChoices={[]}
      selectedModelValue=""
      modelSaving={false}
      modelError={null}
      modelLabels={{}}
      onModelChange={() => {}}
    />,
  );
}

function composerField() {
  return screen.getByRole('textbox', {
    name: '写下问题、判断或行动要求，@ 引用研究资料…',
  });
}

async function canvasIframe() {
  return waitFor(() => {
    const node = document.querySelector('iframe[title="canvas"]');
    if (!(node instanceof HTMLIFrameElement)) throw new Error('canvas iframe missing');
    return node;
  });
}

afterEach(() => {
  cleanup();
});

describe('AssistantConversation composer focus', () => {
  it('focuses the composer after opening a linked canvas conversation', () => {
    renderConversation();
    expect(composerField()).toBe(document.activeElement);
  });

  it('reclaims focus if the linked canvas iframe takes it on load', async () => {
    renderConversation();
    const iframe = await canvasIframe();
    iframe.focus();
    iframe.dispatchEvent(new Event('load'));
    await waitFor(() => expect(composerField()).toBe(document.activeElement));
  });

  it('keeps focus on the canvas when the user clicks it', async () => {
    renderConversation();
    const iframe = await canvasIframe();
    iframe.focus();
    expect(iframe).toBe(document.activeElement);
  });
});
