# 用户消息操作条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AI 对话的用户气泡加上复制 / 编辑 / 重试，编辑和重试只作用于最后一条用户提问，并让助手侧现有「重试」改为清掉后面再发，不再追加一条重复提问。

**Architecture:** 在共用 `conversationStore` 增加 `replaceLastUserTurn`（删掉最后一条用户提问之后的消息，必要时改这条的正文）。`conversationEngine.run` 增加 `replaceLast`：拿到锁之后先替换，再跳过 append 用户消息，用库里那条当本轮提问。chart / assistant 的 `postMessage` 增加可选 `replaceLast`。前端复用 `MessageActions`，用户行悬停显示、就地编辑。

**Tech Stack:** TypeScript、drizzle、vitest、React、stylex、lucide-react。

## Global Constraints

- 文档与回复用中文白话；代码标识符英文。零注释、零 JSDoc。
- 文件 ≤ 500 行，React 组件 ≤ 300 行。
- 只测 / 只 lint 改动的文件所在包：`pnpm --filter @kansoku/core test`、`pnpm --filter @kansoku/web test`。不要全仓 `pnpm test`。
- 研究对话的 HTTP/IPC 实现在 pro overlay，本仓库只改 `ResearchApi` 类型和前端 adapter；overlay 里对应 `postMessage` 必须同样接收 `replaceLast` 并传给同一套 engine。
- 助手气泡操作条保持常驻，不改成悬停。

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/ai/conversation/conversationStore.ts` | `replaceLastUserTurn` / `updateTitle` |
| `packages/core/src/ai/chat/chatStore.ts` | 转出 store 方法 |
| `packages/core/src/ai/assistant/assistantChatStore.ts` | 转出 store 方法 |
| `packages/core/src/ai/conversation/conversationEngine.ts` | `run(..., { replaceLast })`，跳过 append |
| `packages/core/src/ai/chat/chat.ts`、`assistantChat.ts` | 把 options 传进 engine，chart 的 store 补 `updateTitle` |
| `packages/core/src/contract/chat.ts`、`assistant.ts`、`research.ts` | `postMessage` 增加 `replaceLast?: boolean` |
| `*.service.ts`、HTTP controller | 解析 flag，映射 `no_user` → 409 |
| `apps/web/src/features/cockpit/chat/useChatSession.ts` | `send(text, { replaceLast })`，`retryLast` 走替换 |
| `MessageActions.tsx`、`TranscriptBlockView.tsx`、`ConversationTranscript.tsx` | 用户行操作条 + 就地编辑 |
| `ChatDock.tsx`、`AssistantConversation.tsx`、`useMessageQueue.ts` | composer 关掉、队列暂停 |
| `apps/web/src/styles.css` | 用户行预留高度 + 悬停显隐 |

---

### Task 1: `replaceLastUserTurn` 落在 conversationStore

**Files:**
- Modify: `packages/core/src/ai/conversation/conversationStore.ts`
- Modify: `packages/core/src/ai/chat/chatStore.ts`
- Modify: `packages/core/src/ai/assistant/assistantChatStore.ts`
- Test: `packages/core/test/chatStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ReplaceLastUserTurnResult =
    | { ok: false; reason: 'no_user' }
    | { ok: true; isFirstUser: boolean };

  replaceLastUserTurn(sessionId: string, text: string, db?: Db): Promise<ReplaceLastUserTurnResult>
  updateTitle(sessionId: string, title: string, db?: Db): Promise<void>
  ```
- `text` 已经 trim 过、非空。方法内部用 `stampSentAt(text, Date.now())` 重写最后一条用户消息的 `payload.content` 和 `payload.timestamp`。
- 删除条件：`role === 'user'` 的最后一条之后的全部行（含 assistant / toolResult / 其它）。
- `isFirstUser`：这条也是会话里第一条 `role === 'user'`。
- `updateTitle` 只改 session 表的 `title` + `updatedAt`，不管「是不是第一条」。

- [ ] **Step 1: 写失败测试**

在 `packages/core/test/chatStore.test.ts` 增加 import：`replaceLastUserTurn`、`updateTitle`，以及 `stripSentAt` from `../src/ai/conversation/conversationShared.js`。追加：

```ts
describe('chatStore replaceLastUserTurn', () => {
  it('returns no_user when the session has no user message', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    expect(await replaceLastUserTurn(session.id, 'hi', db)).toEqual({
      ok: false,
      reason: 'no_user',
    });
  });

  it('deletes messages after the last user and rewrites that user payload', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    await appendMessages(
      session.id,
      [
        userMessage('first'),
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], timestamp: Date.now() } as AgentMessage,
        userMessage('second'),
        { role: 'assistant', content: [{ type: 'text', text: 'later' }], timestamp: Date.now() } as AgentMessage,
        toolResultMessage('tool'),
      ],
      db,
    );

    const result = await replaceLastUserTurn(session.id, 'second edited', db);
    expect(result).toEqual({ ok: true, isFirstUser: false });

    const rows = await listMessages(session.id, db);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant', 'user']);
    expect(stripSentAt(String(rows[2].payload.content))).toBe('second edited');
    expect(rows[0].payload).toEqual(userMessage('first'));
  });

  it('marks isFirstUser when the last user is also the first', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'a' }, db);
    await appendMessages(
      session.id,
      [
        userMessage('only'),
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }], timestamp: Date.now() } as AgentMessage,
      ],
      db,
    );
    expect(await replaceLastUserTurn(session.id, 'only', db)).toEqual({
      ok: true,
      isFirstUser: true,
    });
    expect(await listMessages(session.id, db)).toHaveLength(1);
  });
});

describe('chatStore updateTitle', () => {
  it('rewrites title and bumps updatedAt', async () => {
    const db = createDb(':memory:');
    const session = await createSession({ chartId: 'c1', symbol: 'MU.US', title: 'old' }, db);
    await updateTitle(session.id, 'new title', db);
    const found = await getSessionByChartId('c1', db);
    expect(found?.title).toBe('new title');
    expect(new Date(found!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(session.updatedAt).getTime(),
    );
  });
});
```

`userMessage` 现在返回的 payload 没有 sent-at 前缀。替换后的 content 带前缀，所以断言必须 `stripSentAt`。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/core exec vitest run test/chatStore.test.ts`

Expected: FAIL，`replaceLastUserTurn` / `updateTitle` is not a function 或 import 失败。

- [ ] **Step 3: 实现 store**

`conversationStore.ts`：

- import 改为 `import { asc, eq, inArray, type AnyColumn } from 'drizzle-orm'`
- import `stampSentAt` from `./conversationShared.js`
- `ConversationStore` 接口加上面两个方法
- 实现：

```ts
async function replaceLastUserTurn(
  sessionId: string,
  text: string,
  db: Db = getDb(),
): Promise<ReplaceLastUserTurnResult> {
  const rows = await listMessages(sessionId, db);
  let lastUserIndex = -1;
  let firstUserIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.role !== 'user') continue;
    if (firstUserIndex === -1) firstUserIndex = index;
    lastUserIndex = index;
  }
  if (lastUserIndex === -1) return { ok: false, reason: 'no_user' };

  const lastUser = rows[lastUserIndex];
  const deleteIds = rows.slice(lastUserIndex + 1).map((row) => row.id);
  const sentAt = Date.now();
  const payload: AgentMessage = {
    ...(lastUser.payload as AgentMessage),
    role: 'user',
    content: stampSentAt(text, sentAt),
    timestamp: sentAt,
  };
  const now = new Date().toISOString();

  db.transaction((tx) => {
    if (deleteIds.length > 0) {
      tx.delete(chatMessages).where(inArray(chatMessages.id, deleteIds)).run();
    }
    tx.update(chatMessages)
      .set({ payload })
      .where(eq(chatMessages.id, lastUser.id))
      .run();
    tx.update(config.sessionTable)
      .set({ updatedAt: now } as Record<string, unknown>)
      .where(eq(config.idColumn, sessionId))
      .run();
  });

  return { ok: true, isFirstUser: firstUserIndex === lastUserIndex };
}

async function updateTitle(sessionId: string, title: string, db: Db = getDb()): Promise<void> {
  const now = new Date().toISOString();
  db.update(config.sessionTable)
    .set({ title, updatedAt: now } as Record<string, unknown>)
    .where(eq(config.idColumn, sessionId))
    .run();
}
```

return 对象带上这两个方法。`ReplaceLastUserTurnResult` 从本文件 export。

`chatStore.ts` / `assistantChatStore.ts` 各加：

```ts
export function replaceLastUserTurn(
  sessionId: string,
  text: string,
  db?: Db,
): Promise<ReplaceLastUserTurnResult> {
  return store.replaceLastUserTurn(sessionId, text, db);
}

export function updateTitle(sessionId: string, title: string, db?: Db): Promise<void> {
  return store.updateTitle(sessionId, title, db);
}
```

assistant 的 `updateTitle` 可以和现有 `updateAssistantSessionTitle` 并存；engine 走 store 的 `updateTitle`。不要改 `updateAssistantSessionTitle` 的签名。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/core exec vitest run test/chatStore.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/conversation/conversationStore.ts packages/core/src/ai/chat/chatStore.ts packages/core/src/ai/assistant/assistantChatStore.ts packages/core/test/chatStore.test.ts
git commit -m "feat(chat): replace last user turn in conversation store"
```

---

### Task 2: engine `replaceLast` 跳过 append

**Files:**
- Modify: `packages/core/src/ai/conversation/conversationEngine.ts`
- Test: `packages/core/test/conversationEngine.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ReplaceLastUserTurnResult` 形状（engine 的 store adapter 自己实现，不直接 import store）
- Produces:
  ```ts
  export type ConversationRunOptions = { replaceLast?: boolean };

  export interface ConversationTurnStore {
    getSession(): Promise<{ id: string } | null>;
    createSession(title: string): Promise<{ id: string }>;
    listMessages(sessionId: string): Promise<ConversationMessageRow[]>;
    appendMessages(sessionId: string, messages: AgentMessage[]): Promise<void>;
    replaceLastUserTurn(sessionId: string, text: string): Promise<ReplaceLastUserTurnResult>;
    updateTitle?(sessionId: string, title: string): Promise<void>;
  }

  run(key: string, text: string, input: TInput, options?: ConversationRunOptions)
    : Promise<ConversationStartResult<TReason>>

  ConversationStartResult.reason: 'busy' | 'no_user' | TReason
  ```

- [ ] **Step 1: 写失败测试**

在 `conversationEngine.test.ts` 的 `memoryStore()` 里实现 `replaceLastUserTurn` / `updateTitle`：

```ts
replaceLastUserTurn: async (_sessionId: string, text: string) => {
  let lastUserIndex = -1;
  let firstUserIndex = -1;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.role !== 'user') continue;
    if (firstUserIndex === -1) firstUserIndex = index;
    lastUserIndex = index;
  }
  if (lastUserIndex === -1) return { ok: false as const, reason: 'no_user' as const };
  rows.splice(lastUserIndex + 1);
  const last = rows[lastUserIndex];
  last.payload = { ...last.payload, content: stampSentAt(text, 0), timestamp: 0 };
  return { ok: true as const, isFirstUser: firstUserIndex === lastUserIndex };
},
updateTitle: async (_sessionId: string, title: string) => {
  titles.push(`retitle:${title}`);
},
```

追加测试（放在 persistence describe 里）：

```ts
it('replaceLast reuses the last user row instead of appending another', async () => {
  const engine = makeEngine();
  const store = memoryStore();
  const first = await engine.run('k-replace', 'first', makeTurn(store, noopFactory()));
  if (first.started) await first.done;
  const second = await engine.run('k-replace', 'second', makeTurn(store, noopFactory()));
  if (second.started) await second.done;
  expect(store.rows.filter((row) => row.role === 'user')).toHaveLength(2);

  const factory: AiAgentFactory = (config) => ({
    prompt: async () => {},
    abort: () => {},
    state: {
      messages: [...(config.messages ?? []), assistantMessage('replay')],
    },
  });
  const replay = await engine.run(
    'k-replace',
    'second edited',
    makeTurn(store, factory),
    { replaceLast: true },
  );
  expect(replay.started).toBe(true);
  if (replay.started) await replay.done;

  const users = store.rows.filter((row) => row.role === 'user');
  expect(users).toHaveLength(2);
  expect(stripSentAt(String(users[1].payload.content))).toBe('second edited');
  expect(store.rows.filter((row) => row.role === 'assistant').at(-1)).toMatchObject({
    role: 'assistant',
  });
});

it('replaceLast with no user message emits error and leaves history empty', async () => {
  const engine = makeEngine();
  const store = memoryStore();
  const events: ConversationEvent[] = [];
  engine.onEvent('k-empty', (event) => events.push(event));
  await store.adapter.createSession('t');
  const result = await engine.run(
    'k-empty',
    'hi',
    makeTurn(store, noopFactory()),
    { replaceLast: true },
  );
  expect(result.started).toBe(true);
  if (result.started) await result.done;
  expect(store.rows).toEqual([]);
  expect(events.some((event) => event.event === 'error')).toBe(true);
});
```

`createSession` 之后 rows 仍为空即可触发 no_user。不要先 `run` 普通回合。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/core exec vitest run test/conversationEngine.test.ts`

Expected: FAIL，`run` 不接受第 4 个参数，或 replaceLast 仍会再 append 一条 user。

- [ ] **Step 3: 改 engine**

从 `conversationStore.ts` import `titleFromText` 已有；再 import type `ReplaceLastUserTurnResult`。

`ConversationEngine.run` 签名加 `options?: ConversationRunOptions`。`executeTurn` 增加同样的 options 参数。

在 `executeTurn` 里，现有：

```ts
let session = await turn.store.getSession();
if (!session) session = await turn.store.createSession(titleFromText(text));
const history = await turn.store.listMessages(session.id);
...
await turn.store.appendMessages(session.id, [userMessage]);
```

换成：

```ts
let session = await turn.store.getSession();
if (options?.replaceLast) {
  if (!session) {
    broadcast(key, { event: 'error', message: '没有可重试的问题' });
    return;
  }
  const replaced = await turn.store.replaceLastUserTurn(session.id, text);
  if (!replaced.ok) {
    broadcast(key, { event: 'error', message: '没有可重试的问题' });
    return;
  }
  if (replaced.isFirstUser) await turn.store.updateTitle?.(session.id, titleFromText(text));
} else if (!session) {
  session = await turn.store.createSession(titleFromText(text));
}

const history = await turn.store.listMessages(session.id);
let historyPayloads = history.map((row) => row.payload);
let userMessage: AgentMessage;

if (options?.replaceLast) {
  const last = history.at(-1);
  if (!last || last.role !== 'user') {
    broadcast(key, { event: 'error', message: '没有可重试的问题' });
    return;
  }
  userMessage = last.payload;
  historyPayloads = history.slice(0, -1).map((row) => row.payload);
} else {
  const sentAt = nowFn();
  userMessage = {
    role: 'user',
    content: stampSentAt(text, sentAt),
    timestamp: sentAt,
  };
  await turn.store.appendMessages(session.id, [userMessage]);
}
```

后面 `createAgentSession({ messages: historyPayloads })` 和 `persistIncrement(..., historyPayloads.length)` 不变（replaceLast 时 `historyPayloads` 不含最后一条用户消息，`+1` 切片仍然跳过这条 user）。

`run` 在拿到锁且 prepare ok 后仍返回 `started: true`。replaceLast 找不到用户提问时，executeTurn 立刻 `error` 事件然后 return，`done` 完成。不要扩展 `reason` 联合类型。

`memoryStore.replaceLastUserTurn` 在 rows 为空时返回 `{ ok: false, reason: 'no_user' }`。replaceLast 分支在 `getSession()` 为 null 时不要 `createSession`，直接 error。测试里先 `await store.adapter.createSession('t')` 再 run。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/core exec vitest run test/conversationEngine.test.ts`

Expected: PASS。现有 persistence 测试不能因为 store adapter 缺 `replaceLastUserTurn` 而挂——普通 `run` 不调用它，但 TypeScript 要求 adapter 有这个方法。所有 `memoryStore` 必须带上实现。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/conversation/conversationEngine.ts packages/core/test/conversationEngine.test.ts
git commit -m "feat(chat): reuse last user message on replaceLast turns"
```

---

### Task 3: 合约、服务、HTTP 接上 `replaceLast`

**Files:**
- Modify: `packages/core/src/contract/chat.ts`
- Modify: `packages/core/src/contract/assistant.ts`
- Modify: `packages/core/src/contract/research.ts`
- Modify: `packages/core/src/ai/chat/chat.ts`（`runChatTurn` 传 options；`prepareTurn` 的 store 补 `replaceLastUserTurn` / `updateTitle`）
- Modify: `packages/core/src/ai/assistant/assistantChat.ts`（同样；assistant 的 `updateTitle` 省略，生成标题仍走现有 `assignSessionTitle`）
- Modify: `packages/core/src/ai/chat/chat.service.ts`
- Modify: `packages/core/src/ai/assistant/assistantChat.service.ts`
- Modify: `apps/server/src/modules/chat/chat.controller.ts`
- Modify: `apps/server/src/modules/assistant/assistant.controller.ts`
- Test: `packages/core/test/chat.test.ts`、`packages/core/test/assistantContract.test.ts`

**Interfaces:**
- Consumes: `ConversationRunOptions`、`replaceLastUserTurn`、`updateTitle`
- Produces:
  ```ts
  postMessage(input: { id: string; text: string; replaceLast?: boolean }): Promise<PostMessageResult>
  // research: { path: string; text: string; replaceLast?: boolean }
  runChatTurn(chartId, text, deps, options?: ConversationRunOptions)
  runAssistantChatTurn(sessionId, text, deps, options?: ConversationRunOptions)
  ```

- [ ] **Step 1: 写失败测试**

在 `packages/core/test/chat.test.ts` 找现有 `runChatTurn` 双回合测试附近，追加（沿用该文件已有的 fake model / 落盘辅助）：

```ts
it('replaceLast keeps a single last user message and drops the previous assistant reply', async () => {
  // 先正常跑一轮，再 replaceLast: true 用同一 text 再跑
  // 断言 listMessages 里 user 条数仍为 1，最后一条 assistant 是第二轮的回复
});
```

具体装配复制该文件里最近一条成功的 `runChatTurn` 测试的 deps（agentFactory 返回固定 assistant 文本）。第一轮 text `'问1'`，第二轮 `runChatTurn(id, '问1改', deps, { replaceLast: true })`。

`assistantContract.test.ts` 同样加一条：两次 `postMessage`，第二次带 `replaceLast: true`，`getChat` 的 messages 里只有一条 user。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/core exec vitest run test/chat.test.ts test/assistantContract.test.ts`

Expected: FAIL，`postMessage` / `runChatTurn` 不接受 `replaceLast`，或第二次变成两条 user。

- [ ] **Step 3: 接线**

三个 contract 的 `postMessage` input 加 `replaceLast?: boolean`。

`runChatTurn` / `runAssistantChatTurn` 最后一参 `options?: ConversationRunOptions`，转给 `engine.run(..., options)`。

`prepareTurn` 的 store 对象补：

chart (`chat.ts`):

```ts
replaceLastUserTurn: (sessionId, text) => replaceLastUserTurn(sessionId, text),
updateTitle: (sessionId, title) => updateTitle(sessionId, title),
```

assistant (`assistantChat.ts`):

```ts
replaceLastUserTurn: (id, text) => replaceLastUserTurn(id, text, deps.db),
```

不要给 assistant 填 `updateTitle`。第一条提问仍是 `DEFAULT_ASSISTANT_TITLE` 时，现有 `assignSessionTitle` 会按新文本生成；已经生成过的标题不覆盖。

service：

```ts
async postMessage(input) {
  const text = parseClientInput(clientMessageSchema, input.text, '...');
  const result = await runChatTurn(input.id, text, buildDeps(), {
    replaceLast: input.replaceLast === true,
  });
  ...
}
```

HTTP：body 类型改为 `{ text?: unknown; replaceLast?: unknown } | null`。`replaceLast` 不是 `boolean` 也不是 `undefined` 时抛 400。传给 service 的是 `replaceLast: body?.replaceLast === true`。

desktop IPC 已经 `postMessage(input)` 原样转发，不用改文件。

研究对话：只改 `ResearchApi.postMessage` 类型。然后在 `apps/pro`（`pnpm overlay:sync` 之后的投影目录）搜 `postMessage` + research，把 `replaceLast` 传到它的 `engine.run`。找不到实现就在本 task 的 commit message 里写明 overlay 待补，不要假装改了。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/core exec vitest run test/chat.test.ts test/assistantContract.test.ts test/conversationEngine.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/contract/chat.ts packages/core/src/contract/assistant.ts packages/core/src/contract/research.ts packages/core/src/ai/chat/chat.ts packages/core/src/ai/chat/chat.service.ts packages/core/src/ai/assistant/assistantChat.ts packages/core/src/ai/assistant/assistantChat.service.ts apps/server/src/modules/chat/chat.controller.ts apps/server/src/modules/assistant/assistant.controller.ts packages/core/test/chat.test.ts packages/core/test/assistantContract.test.ts
git commit -m "feat(chat): accept replaceLast on postMessage"
```

---

### Task 4: 前端 `send` / `retryLast` 走替换

**Files:**
- Modify: `apps/web/src/features/cockpit/chat/useChatSession.ts`
- Test: `apps/web/src/features/cockpit/chat/useChatSession.test.ts`

**Interfaces:**
- Consumes: `client.chat.postMessage({ id, text, replaceLast })` 等
- Produces:
  ```ts
  export function lastUserRow(rows: readonly ChatRow[]): ChatRow | undefined

  type ConversationAdapter.send = (
    id: string,
    text: string,
    options?: { replaceLast?: boolean },
  ) => Promise<{ status: number; body: unknown }>

  send(text: string, options?: { replaceLast?: boolean }): Promise<ChatSendResult>
  retryLast(): Promise<ChatSendResult>
  replaceLast(text: string): Promise<ChatSendResult>  // send(text, { replaceLast: true })
  ```

- [ ] **Step 1: 写失败测试**

`useChatSession.test.ts` 追加：

```ts
import { lastUserRow } from './useChatSession';
import type { ChatRow } from './useChatSession';

describe('lastUserRow', () => {
  it('returns the last user row with text', () => {
    const rows: ChatRow[] = [
      { id: 'u1', ts: 't', kind: 'user', text: 'a' },
      { id: 'a1', ts: 't', kind: 'assistant', text: 'b' },
      { id: 'u2', ts: 't', kind: 'user', text: 'c' },
      { id: 'e1', ts: 't', kind: 'error', text: 'fail' },
    ];
    expect(lastUserRow(rows)?.id).toBe('u2');
  });

  it('skips blank user rows', () => {
    const rows: ChatRow[] = [
      { id: 'u1', ts: 't', kind: 'user', text: 'a' },
      { id: 'u2', ts: 't', kind: 'user', text: '   ' },
    ];
    expect(lastUserRow(rows)?.id).toBe('u1');
  });
});
```

adapter 测试追加（若现有文件只测 channel，不要在这里 mock fetch；adapter 签名变更后 `send` 必须把 `replaceLast` 传进 client。可把 adapter.send 的实现抽成一眼能读的对象字面量，用下面这种断言改测试文件：直接读函数源不可靠。改为小纯函数）：

在 `useChatSession.ts` 导出：

```ts
export function postMessageInput(
  text: string,
  options?: { replaceLast?: boolean },
): { text: string; replaceLast?: boolean } {
  return options?.replaceLast ? { text, replaceLast: true } : { text };
}
```

测试：

```ts
it('omits replaceLast unless asked', () => {
  expect(postMessageInput('hi')).toEqual({ text: 'hi' });
  expect(postMessageInput('hi', { replaceLast: true })).toEqual({
    text: 'hi',
    replaceLast: true,
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/useChatSession.test.ts`

Expected: FAIL，`lastUserRow` / `postMessageInput` 未导出。

- [ ] **Step 3: 改 session**

`lastUserRow`：从后往前找 `kind === 'user' && text?.trim()`。

`conversationAdapters.*.send`：

```ts
send: (id, text, options) =>
  client.chat.postMessage({ id, ...postMessageInput(text, options) }),
```

research 用 `{ path: id, ...postMessageInput(text, options) }`。

`send` 实现：

- `replaceLast` 为 true 时：`setRows` 截到 `lastUserRow` 那条（含），若文本变了就改那条的 `text`；不要再 push optimistic 行。
- 失败时不要按 optimisticId 删除；调用现有 `reload()`（或 `setHint` + `reload`），与今天发送失败对称。
- `adapter.send(id, trimmed, options)`。
- `retryLast`：`const last = lastUserRow(rows); if (!last?.text) return { ok:false, error:'没有可重试的问题' }; return send(last.text, { replaceLast: true })`。
- `replaceLast: (text) => send(text, { replaceLast: true })`，加入 `ChatSessionState`。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/useChatSession.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/cockpit/chat/useChatSession.ts apps/web/src/features/cockpit/chat/useChatSession.test.ts
git commit -m "feat(web): send replaceLast from chat session"
```

---

### Task 5: `MessageActions` + 用户行悬停操作条

**Files:**
- Modify: `apps/web/src/features/cockpit/chat/MessageActions.tsx`
- Modify: `apps/web/src/features/cockpit/chat/TranscriptBlockView.tsx`
- Modify: `apps/web/src/features/cockpit/chat/ConversationTranscript.tsx`
- Modify: `apps/web/src/styles.css`（`.chat-row--user` 一段）
- Test: `apps/web/src/features/cockpit/chat/ConversationTranscript.test.tsx`

**Interfaces:**
- Consumes: `lastUserRow`、`onRetryLast`
- Produces:
  ```ts
  MessageActions({
    text: string
    onRetry?: () => void
    onEdit?: () => void
    align?: 'start' | 'end'
    retryDisabled?: boolean
    editDisabled?: boolean
  })
  ```

- [ ] **Step 1: 写失败测试**

`ConversationTranscript.test.tsx` 用现有 `completedRows`（最后一条是 assistant）。追加一组：

```ts
it('shows copy on an earlier user bubble and copy-edit-retry on the last user bubble', () => {
  const rows: ChatRow[] = [
    row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '第一问' }),
    row({ id: 'a1', ts: ts('10:00:01'), kind: 'assistant', text: '答' }),
    row({ id: 'u2', ts: ts('10:00:02'), kind: 'user', text: '第二问' }),
    row({ id: 'a2', ts: ts('10:00:03'), kind: 'assistant', text: '再答' }),
  ];
  renderTranscript(rows, { onRetryLast: () => {}, onEditLast: () => {} });
  const copyButtons = screen.getAllByRole('button', { name: '复制' });
  expect(copyButtons.length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: '重试' }).length).toBeGreaterThanOrEqual(1);
});

it('disables edit and retry on the last user bubble while busy', () => {
  render(
    <ConversationTranscript
      rows={[
        row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '问' }),
      ]}
      busy
      streamText=""
      liveTools={[]}
      suggestions={[]}
      emptyText=""
      onPickSuggestion={() => {}}
      onRetryLast={() => {}}
      onEditLast={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: '编辑' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: '重试' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: '复制' })).toHaveProperty('disabled', false);
});
```

助手最后一条仍有自己的重试按钮，所以「重试」数量 ≥ 1。用 `getAllByRole('button', { name: '编辑' })` 长度为 1 区分用户侧。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/ConversationTranscript.test.tsx`

Expected: FAIL，找不到「编辑」按钮。

- [ ] **Step 3: 实现操作条**

`MessageActions.tsx`：

- props 增加 `onEdit?`、`align?: 'start' | 'end'`（默认 `'start'`）、`retryDisabled?`、`editDisabled?`
- `row` style 加 `alignSelf: align === 'end' ? 'flex-end' : 'flex-start'`
- 复制按钮之后：若 `onEdit`，渲染 Pencil 图标按钮，`aria-label="编辑"`，`disabled={editDisabled}`
- 重试按钮加 `disabled={retryDisabled}`
- disabled 样式：`opacity: 0.28`、`cursor: 'default'`，不要 `:hover` 变色

`TranscriptBlockView` 的 user 分支：在气泡下方渲染 `MessageActions`。props 增加：

```ts
userActions?: {
  onRetry?: () => void
  onEdit?: () => void
  retryDisabled?: boolean
  editDisabled?: boolean
} | null
```

`userActions` 为 null/undefined 时不渲染（历史消息由父组件传 `{ }` 只有复制：父组件对非最后一条传 `{ }`，对最后一条传完整回调）。复制始终需要 `text`，所以只要 `showUserActions` 为 true 就渲染，`onEdit`/`onRetry` 按是否最后一条传入。

更干净：父组件对每条 user 都传 `showUserActions: true`，最后一条才传 onEdit/onRetry。

`ConversationTranscript`：

```ts
const lastUserId = lastUserRow(rows)?.id
...
showUserActions
userActions={
  block.row.id === lastUserId
    ? {
        onRetry: onRetryLast,
        onEdit: onEditLast,
        retryDisabled: busy,
        editDisabled: busy,
      }
    : {}
}
```

增加 prop `onEditLast?: () => void`（Task 6 会改成内部状态；本 task 先从父组件传入也可以。为减少来回，本 task 就在 transcript 内留 `onEditLast` 回调，Task 6 改成内部编辑态）。

`styles.css` 在现有 `.chat-row--user` 上补：

```css
.chat-row--user {
  justify-content: flex-end;
  flex-direction: column;
  align-items: flex-end;
  padding-bottom: 34px;
}
.chat-row--user .chat-message-actions {
  opacity: 0;
  pointer-events: none;
}
.chat-row--user:hover .chat-message-actions,
.chat-row--user:focus-within .chat-message-actions {
  opacity: 1;
  pointer-events: auto;
}
```

测试环境 jsdom 没有 hover，但按钮仍在 DOM 里，`getByRole` 找得到。不要用 `visibility: hidden`，以免测不到。

助手 `MessageActions` 的 `showActions` 逻辑不要改。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/ConversationTranscript.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/cockpit/chat/MessageActions.tsx apps/web/src/features/cockpit/chat/TranscriptBlockView.tsx apps/web/src/features/cockpit/chat/ConversationTranscript.tsx apps/web/src/styles.css apps/web/src/features/cockpit/chat/ConversationTranscript.test.tsx
git commit -m "feat(web): show copy edit retry on user chat bubbles"
```

---

### Task 6: 就地编辑 + 关掉 composer + 暂停队列

**Files:**
- Modify: `apps/web/src/features/cockpit/chat/TranscriptBlockView.tsx`
- Modify: `apps/web/src/features/cockpit/chat/ConversationTranscript.tsx`
- Modify: `apps/web/src/features/cockpit/chat/ChatPanel.tsx`
- Modify: `apps/web/src/features/cockpit/chat/ChatDock.tsx`
- Modify: `apps/web/src/features/assistant/AssistantConversation.tsx`
- Modify: `apps/web/src/features/assistant/useMessageQueue.ts`
- Modify: `apps/web/src/features/assistant/messageQueue.ts`（若把 paused 放进 `nextQueueAction`）
- Test: `apps/web/src/features/cockpit/chat/ConversationTranscript.test.tsx`
- Test: `apps/web/src/features/assistant/messageQueue.test.ts`

**Interfaces:**
- Consumes: `replaceLast(text)` from `useChatSession`
- Produces:
  ```ts
  ConversationTranscript.onReplaceLast?: (text: string) => void
  ConversationTranscript.onEditingChange?: (editing: boolean) => void

  nextQueueAction(prevBusy, busy, queue, paused?: boolean)
  // paused === true → { send: null, queue }
  useMessageQueue({ busy, paused?: boolean, onSend })
  ```

- [ ] **Step 1: 写失败测试**

transcript：

```ts
it('turns the last user bubble into an editor and submits via onReplaceLast', async () => {
  const onReplaceLast = vi.fn();
  renderTranscript(
    [
      row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '原问' }),
      row({ id: 'a1', ts: ts('10:00:01'), kind: 'assistant', text: '答' }),
    ],
    { onRetryLast: () => {}, onReplaceLast },
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: '新问' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  expect(onReplaceLast).toHaveBeenCalledWith('新问');
});

it('cancel restores the original bubble', () => {
  renderTranscript(
    [row({ id: 'u1', ts: ts('10:00:00'), kind: 'user', text: '原问' })],
    { onReplaceLast: () => {} },
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('原问')).toBeTruthy();
});
```

`messageQueue.test.ts`：

```ts
it('does not dequeue while paused', () => {
  const queue = [{ id: 'q1', text: 'a', error: null }];
  expect(nextQueueAction(true, false, queue, true)).toEqual({ send: null, queue });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/ConversationTranscript.test.tsx src/features/assistant/messageQueue.test.ts`

Expected: FAIL

- [ ] **Step 3: 实现编辑态**

`ConversationTranscript` 内部 `const [editingId, setEditingId] = useState<string | null>(null)`。`lastUserId` 变化或 `busy` 变 true 时 `setEditingId(null)`。`useEffect` 里 `onEditingChange?.(editingId !== null)`。

点编辑：`setEditingId(lastUserId)`。

`TranscriptBlockView` user 分支：若 `editing`，渲染 textarea（默认值 `row.text`，本地 state），右下「取消」「发送」。发送键 `backgroundColor: colors.accent; color: '#000'`，空内容（trim）时 disabled。

键盘：textarea `onKeyDown`：`Escape` → 取消；`Enter` 且非 `shiftKey` 且非 `isComposing` → 发送；`Shift+Enter` 换行。

发送：`onReplaceLast(trimmed)` 然后 `setEditingId(null)`。

编辑中不渲染 `MessageActions`。

`nextQueueAction` 第四参 `paused`：为 true 直接 `{ send: null, queue }`。`useMessageQueue` 增加 `paused = false`，effect 依赖加 `paused`，开头 `if (paused) return`（仍更新 `wasBusyRef.current = busy`，这样暂停期间 busy 边沿不会在恢复时被当成 becameIdle）。

`ChatPanel` 把 `onReplaceLast` / `onEditingChange` 原样传给 `ConversationTranscript`。

`ChatDock`：`const [editing, setEditing] = useState(false)`，经 `ChatPanel` 传 `onEditingChange={setEditing}`、`onReplaceLast={(text) => void replaceLast(text)}`。`ChatComposer` 传 `disabled={editing}`。

`AssistantConversation` 同样：`paused: editing` 传给 `useMessageQueue`；composer `disabled={editing}`。

- [ ] **Step 4: 再跑测试**

Run: `pnpm --filter @kansoku/web exec vitest run src/features/cockpit/chat/ConversationTranscript.test.tsx src/features/assistant/messageQueue.test.ts src/features/cockpit/chat/useChatSession.test.ts`

Expected: PASS

然后只对改动文件 lint：`pnpm --filter @kansoku/web exec eslint` 加上列过的 tsx，`pnpm --filter @kansoku/core exec tsc --noEmit` 若你改了 core（本 task 没有则跳过）。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/cockpit/chat/TranscriptBlockView.tsx apps/web/src/features/cockpit/chat/ConversationTranscript.tsx apps/web/src/features/cockpit/chat/ConversationTranscript.test.tsx apps/web/src/features/cockpit/chat/ChatPanel.tsx apps/web/src/features/cockpit/chat/ChatDock.tsx apps/web/src/features/assistant/AssistantConversation.tsx apps/web/src/features/assistant/useMessageQueue.ts apps/web/src/features/assistant/messageQueue.ts apps/web/src/features/assistant/messageQueue.test.ts
git commit -m "feat(web): inline-edit last user chat message"
```

---

## 自检

| Spec 条目 | Task |
| --- | --- |
| 复制任何用户气泡 | 5 |
| 编辑/重试仅最后一条 | 5 |
| 悬停出现、预留高度、图标无字 | 5 |
| 就地编辑、Esc/Enter、空内容不能发 | 6 |
| 编辑时关掉 composer、队列不出队 | 6 |
| 正在回答时编辑/重试灰掉、复制可点 | 5 |
| 重试清掉后面再发、不追加用户气泡 | 2、3、4 |
| 助手重试走同一路径 | 4（`retryLast` → `replaceLast`） |
| 第一条提问改标题（chart `updateTitle`；assistant 不覆盖生成标题） | 2、3 |
| 三类 postMessage `replaceLast` | 3（research overlay 手补） |
| 不做删除/点赞/分支/助手改悬停 | 未做 |

无 TBD。名称统一为 `replaceLast` / `replaceLastUserTurn` / `ConversationRunOptions`。
