# 画布 Param Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `@kansoku/canvas` 加一个受控数字积木 `Param`，用户改数后同一份画布里的 `Stat` / `RRPlan` 立刻跟着变。

**Architecture:** `Param` 放在现有 `control.tsx`，和 `Toggle` / `Select` 同一层。状态仍是画布源码里的 `useState` / `useMemo`。有 `min` 且 `max` 才渲染滑条。编译、iframe、活行情、对话协议、画布落盘都不动。`reviewCanvasStructure` 拒原生 `<input>` / `<textarea>`，以及只给了 `min` 或只给了 `max` 的 `Param`。

**Tech Stack:** React 19、`@base-ui/react` Number Field + Slider、vitest + testing-library、现有 canvas skill 类型生成脚本。

## Global Constraints

- Spec 权威：`docs/superpowers/specs/2026-09-05-canvas-param-design.md`。冲突以 spec 为准。
- 零注释、零 JSDoc。文件 ≤ 500 行，React 组件 ≤ 300 行。
- 只 lint/typecheck 改过的文件；测试只跑改动相关的 vitest 文件。`apps/web` 用 `pnpm --filter @kansoku/web test -- <file>`，不要 `exec vitest`。
- 画布源码仍禁 `useEffect` / `fetch` / 定时器；SDK 内部可以用 `useEffect`。
- 不改 `compile.ts`、`CanvasFrame`、`postMessage`、活行情钩子、画布 JSON、任何对话工具、任何 Pro 门。
- 不导出独立的 `NumberField` / `Slider`。不给 `Param` 加 `style` / `className` / children。
- 文档与 skill 规则正文用英文（skill 惯例），画布可见文案用中文白话。
- 每个 task 提交一次，信息 `feat(canvas): …`，不加 AI 署名。不 push。

## File structure

- `packages/canvas-sdk/src/control.tsx` — `Param` 和现有 `Toggle` / `Select` 放一起（加完仍远低于 500 行，不拆文件）。
- `packages/canvas-sdk/src/index.tsx` / `names.ts` — 导出并登记 `Param`。
- `apps/web/src/features/canvas/Param.test.tsx` — 组件行为单测（canvas-sdk 自己没有 test runner）。
- `apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx` — 「当场算」验收件。必须在把 `Param` 写入 `names.ts` 的同一 task 里加上 `<Param`，否则现有 `exercises every component` 测试会红。
- `packages/core/src/canvas/check.ts` — 只改 `reviewCanvasStructure`。
- `packages/core/test/canvasCheck.test.ts` — 新规则单测。
- `packages/core/skills/canvas/SKILL.md` + `pnpm --filter @kansoku/canvas types:skill` 生成的 `sdk/*.d.ts`。

---

### Task 1: Param 组件 + 导出 + kitchenSink 当场算

**Files:**
- Create: `apps/web/src/features/canvas/Param.test.tsx`
- Modify: `packages/canvas-sdk/src/control.tsx`
- Modify: `packages/canvas-sdk/src/index.tsx`
- Modify: `packages/canvas-sdk/src/names.ts`
- Modify: `apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx`

**Interfaces:**
- Consumes: `@base-ui/react/number-field`、`@base-ui/react/slider`、`theme`（`packages/canvas-sdk/src/theme.ts`）
- Produces: `Param({ label: string; value: number; onChange: (next: number) => void; min?: number; max?: number; step?: number; unit?: string })`；`names.control` 含 `'Param'`；kitchenSink 源码含 `<Param`

- [ ] **Step 1: 写失败的组件测试**

创建 `apps/web/src/features/canvas/Param.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Param } from '@kansoku/canvas';

afterEach(() => cleanup());

describe('Param', () => {
  it('renders a slider only when min and max are both set', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Param label="止损" value={58} onChange={onChange} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} min={50} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} max={70} />);
    expect(screen.queryByRole('slider')).toBeNull();

    rerender(<Param label="止损" value={58} onChange={onChange} min={50} max={70} />);
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('snaps and clamps on blur, and ignores invalid drafts', () => {
    const onChange = vi.fn();
    render(<Param label="止损" value={58.4} onChange={onChange} min={50} max={70} step={0.05} />);
    const input = screen.getByRole('textbox', { name: '止损' });

    fireEvent.change(input, { target: { value: '61.23' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(61.25);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(70);

    onChange.mockClear();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('58.40');
  });

  it('emits onChange while dragging the slider', () => {
    const onChange = vi.fn();
    render(<Param label="止损" value={58} onChange={onChange} min={50} max={70} step={1} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(59);
  });

  it('restores the default after remount', () => {
    function Harness() {
      const [value, setValue] = useState(61.2);
      return <Param label="入场" value={value} onChange={setValue} />;
    }
    const { unmount } = render(<Harness />);
    const input = screen.getByRole('textbox', { name: '入场' });
    fireEvent.change(input, { target: { value: '64' } });
    fireEvent.blur(input);
    unmount();
    render(<Harness />);
    expect(screen.getByRole('textbox', { name: '入场' })).toHaveValue('61.2');
  });

  it('throws when value, step, or the range is not usable', () => {
    const onChange = vi.fn();
    expect(() => render(<Param label="x" value={Number.NaN} onChange={onChange} />)).toThrow(
      'Param: value must be a finite number',
    );
    cleanup();
    expect(() => render(<Param label="x" value={1} onChange={onChange} step={0} />)).toThrow(
      'Param: step must be > 0',
    );
    cleanup();
    expect(() =>
      render(<Param label="x" value={1} onChange={onChange} min={70} max={50} />),
    ).toThrow('Param: min must be <= max');
  });
});
```

若 Base UI Number Field 的输入角色是 `spinbutton` 而不是 `textbox`，把测试里所有 `getByRole('textbox'` 改成 `getByRole('spinbutton'`，断言 `.toHaveValue` 跟着改。以第一次跑测看到的 role 为准，不要两种都写。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/web test -- src/features/canvas/Param.test.tsx`

Expected: FAIL，`Param` is not exported from `@kansoku/canvas`（或类似）。

- [ ] **Step 3: 实现 `Param` 并导出**

`packages/canvas-sdk/src/control.tsx` 在现有 import 下追加，在文件末尾追加 `Param`。不要改 `Toggle` / `Select`。完整新增如下。

文件头 import 改成：

```tsx
import type { CSSProperties } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Slider } from '@base-ui/react/slider';
import { theme } from './theme.js';
```

文件末尾追加（`Select` 函数之后）：

```tsx
function fractionDigits(step: number): number {
  const text = String(step);
  const exp = text.indexOf('e-');
  if (exp !== -1) return Number(text.slice(exp + 2));
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function snap(n: number, step: number, min?: number, max?: number): number {
  const snapped = Math.round(n / step) * step;
  const rounded = Number(snapped.toFixed(fractionDigits(step)));
  if (min != null && rounded < min) return min;
  if (max != null && rounded > max) return max;
  return rounded;
}

const paramRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 8,
  minHeight: 26,
  width: '100%',
};

const paramLabelStyle: CSSProperties = {
  color: theme.textSecondary,
  flex: '0 0 4em',
  fontSize: 13,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const paramInputStyle: CSSProperties = {
  background: theme.bgElement,
  border: `1px solid ${theme.borderStrong}`,
  borderRadius: theme.radius,
  boxSizing: 'border-box',
  color: theme.textPrimary,
  fontFamily: theme.fontMono,
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  height: 26,
  padding: '0 9px',
  width: '9ch',
};

const paramUnitStyle: CSSProperties = {
  color: theme.textMuted,
  flex: '0 0 auto',
  fontSize: 13,
};

const sliderRootStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flex: 1,
  height: 26,
  minWidth: 80,
};

const sliderControlStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  height: 26,
  alignItems: 'center',
  position: 'relative',
};

const sliderTrackStyle: CSSProperties = {
  background: theme.bgHover,
  borderRadius: theme.radius,
  height: 2,
  width: '100%',
};

const sliderIndicatorStyle: CSSProperties = {
  background: theme.accent,
  borderRadius: theme.radius,
  height: 2,
};

const sliderThumbStyle: CSSProperties = {
  background: theme.accent,
  border: 'none',
  borderRadius: 2,
  height: 10,
  width: 10,
};

export function Param({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  if (!Number.isFinite(value)) throw new Error('Param: value must be a finite number');
  if (!Number.isFinite(step) || step <= 0) throw new Error('Param: step must be > 0');
  const ranged = Number.isFinite(min) && Number.isFinite(max);
  if (ranged && min! > max!) throw new Error('Param: min must be <= max');

  const digits = fractionDigits(step);
  const commit = (next: number | null) => {
    if (next == null || !Number.isFinite(next)) return;
    const snapped = snap(next, step, ranged ? min : undefined, ranged ? max : undefined);
    if (snapped !== value) onChange(snapped);
  };

  return (
    <div style={paramRowStyle}>
      <span style={paramLabelStyle}>{label}</span>
      {ranged ? (
        <Slider.Root
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={commit}
          style={sliderRootStyle}
        >
          <Slider.Control style={sliderControlStyle}>
            <Slider.Track style={sliderTrackStyle}>
              <Slider.Indicator style={sliderIndicatorStyle} />
            </Slider.Track>
            <Slider.Thumb style={sliderThumbStyle} />
          </Slider.Control>
        </Slider.Root>
      ) : null}
      <NumberField.Root
        value={value}
        min={ranged ? min : undefined}
        max={ranged ? max : undefined}
        step={step}
        snapOnStep
        locale="en-US"
        format={{
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
          useGrouping: false,
        }}
        onValueChange={(next, details) => {
          if (details.reason === 'input-change' || details.reason === 'input-clear') return;
          commit(next);
        }}
        onValueCommitted={commit}
      >
        <NumberField.Input aria-label={label} style={paramInputStyle} />
      </NumberField.Root>
      {unit ? <span style={paramUnitStyle}>{unit}</span> : null}
    </div>
  );
}
```

`packages/canvas-sdk/src/index.tsx` 把这一行：

```tsx
export { Select, Toggle } from './control.js';
```

改成：

```tsx
export { Param, Select, Toggle } from './control.js';
```

`packages/canvas-sdk/src/names.ts` 把：

```ts
  control: ['Toggle', 'Select'],
```

改成：

```ts
  control: ['Toggle', 'Select', 'Param'],
```

- [ ] **Step 4: kitchenSink 加上当场算，避免 names 登记测试变红**

`apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx`：

1. 从 `@kansoku/canvas` 的 import 列表里、`Pill` 后面加 `Param`（保持现有字母序不必强求，跟旁边控件放一起即可；加在 `Metric` 和 `PieChart` 之间也可以）。
2. `App` 里现有两个 `useState` 后面加：

```tsx
  const [entry, setEntry] = useState(61.2);
  const [stop, setStop] = useState(59.4);
  const [shares, setShares] = useState(100);
  const risk = useMemo(() => (entry - stop) * shares, [entry, stop, shares]);
```

3. 在 `<Section title="场景与计划">` 之前插入：

```tsx
      <Section title="当场算">
        <Stack gap="sm">
          <Param
            label="入场"
            value={entry}
            onChange={setEntry}
            min={55}
            max={65}
            step={0.05}
            unit="USD"
          />
          <Param
            label="止损"
            value={stop}
            onChange={setStop}
            min={55}
            max={65}
            step={0.05}
            unit="USD"
          />
          <Param label="股数" value={shares} onChange={setShares} step={1} unit="股" />
          <Stat label="单笔风险" value={risk.toFixed(2)} />
        </Stack>
      </Section>
```

三个 `Param` 加一个 `Stat`，满足 skill「Section 至少 2 个元素」。`Stat` 不要为了填格子再造假数。

4. 合格那条 `RRPlan` 改成吃 state，不合格那条保持写死：

```tsx
            <RRPlan
              entry={entry}
              stop={stop}
              targets={[64.5, 68]}
              unit="USD"
              note="按 1R 算，两档目标都过 1.5 下限。"
            />
            <RRPlan entry={61.2} stop={58} targets={62.5} unit="USD" note="这一档故意做成不合格。" />
```

- [ ] **Step 5: 跑测试，确认通过**

Run:

```bash
pnpm --filter @kansoku/web test -- src/features/canvas/Param.test.tsx src/features/canvas/demo/kitchenSink.test.tsx
```

Expected: PASS。若 blur 取整的期望值（`61.25` / `58.40`）和 Number Field 实际展示不一致，以 `snap()` 的结果为准改断言，不要改 spec 的取整公式。

再跑：

```bash
pnpm exec eslint packages/canvas-sdk/src/control.tsx packages/canvas-sdk/src/index.tsx packages/canvas-sdk/src/names.ts apps/web/src/features/canvas/Param.test.tsx apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx
pnpm --filter @kansoku/web typecheck
```

Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-sdk/src/control.tsx packages/canvas-sdk/src/index.tsx packages/canvas-sdk/src/names.ts apps/web/src/features/canvas/Param.test.tsx apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): 增加 Param 数字积木

EOF
)"
```

---

### Task 2: `reviewCanvasStructure` 拒原生输入和残缺区间

**Files:**
- Modify: `packages/core/src/canvas/check.ts`
- Modify: `packages/core/test/canvasCheck.test.ts`

**Interfaces:**
- Consumes: 现有 `openingTags` / `hasProp`；Task 1 的 `<Param` 标签名
- Produces: `reviewCanvasStructure` 在源码含 `<input` / `<textarea` 时返回 `use Param / Toggle / Select, not native input`；`<Param` 只出现 `min` 或只出现 `max` 时返回 `Param min and max must both be set, or neither`

- [ ] **Step 1: 写失败的检查测试**

在 `packages/core/test/canvasCheck.test.ts` 的 `describe('reviewCanvasStructure'` 末尾、最后一个 `it` 之后追加：

```ts
  it('rejects native input and textarea', () => {
    expect(reviewCanvasStructure(wrap('<Text>x</Text><input value={1} />'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
    expect(reviewCanvasStructure(wrap('<Text>x</Text><textarea></textarea>'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
    expect(reviewCanvasStructure(wrap('<Text>x</Text><Input value={1} />'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
  });

  it('rejects Param with only min or only max', () => {
    expect(
      reviewCanvasStructure(wrap('<Text>x</Text><Param label="止损" value={58} min={50} />')),
    ).toContain('Param min and max must both be set, or neither');
    expect(
      reviewCanvasStructure(wrap('<Text>x</Text><Param label="止损" value={58} max={70} />')),
    ).toContain('Param min and max must both be set, or neither');
  });

  it('allows Param with both ends of the range, or with neither', () => {
    expect(
      reviewCanvasStructure(
        wrap('<Text>x</Text><Param label="止损" value={58} min={50} max={70} />'),
      ),
    ).toEqual([]);
    expect(reviewCanvasStructure(wrap('<Text>x</Text><Param label="股数" value={100} />'))).toEqual(
      [],
    );
  });
```

第三条里 `<Input` 大小写不敏感，所以 `<Input` 也要中招——这是故意的，逼 Agent 不要发明 `Input` 组件。

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @kansoku/core test -- test/canvasCheck.test.ts`

Expected: FAIL，新三个 `it` 找不到那两句 issue。

- [ ] **Step 3: 实现检查**

`packages/core/src/canvas/check.ts` 的 `reviewCanvasStructure`，在 `return issues;` 之前追加：

```ts
  if (/<(input|textarea)\b/i.test(source)) {
    issues.push('use Param / Toggle / Select, not native input');
  }

  for (const attrs of openingTags(source, 'Param')) {
    const hasMin = hasProp(attrs, 'min');
    const hasMax = hasProp(attrs, 'max');
    if (hasMin !== hasMax) {
      issues.push('Param min and max must both be set, or neither');
    }
  }
```

不要把这两条放进 `checkCanvasSource`。旧画布不含 `<input` 的仍能编译。

- [ ] **Step 4: 跑测试，确认通过**

Run:

```bash
pnpm --filter @kansoku/core test -- test/canvasCheck.test.ts
pnpm --filter @kansoku/web test -- src/features/canvas/demo/kitchenSink.test.tsx
pnpm exec eslint packages/core/src/canvas/check.ts packages/core/test/canvasCheck.test.ts
pnpm --filter @kansoku/core typecheck
```

Expected: 全部 PASS。kitchenSink 现在有 `Param` 且股数那条没有 min/max、入场/止损两条都有，结构检查应为空。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/canvas/check.ts packages/core/test/canvasCheck.test.ts
git commit -m "$(cat <<'EOF'
feat(canvas): Param 静态检查拒原生输入和残缺区间

EOF
)"
```

---

### Task 3: skill 与类型声明

**Files:**
- Modify: `packages/core/skills/canvas/SKILL.md`
- Modify: `packages/core/skills/canvas/sdk/*.d.ts`（由脚本生成，不要手改）

**Interfaces:**
- Consumes: Task 1 的 `Param` props；Task 2 的两条 issue 文案
- Produces: skill 控件表含 `Param`；`packages/core/skills/canvas/sdk/control.d.ts` 声明 `Param`

- [ ] **Step 1: 改 SKILL.md 三处**

`packages/core/skills/canvas/SKILL.md`：

1. 控件表那一行，从：

```
| Controls | `Toggle`, `Select` |
```

改成：

```
| Controls | `Toggle`, `Select`, `Param` |
```

2. 紧跟着的交互句，从：

```
Interactivity is `useState` / `useMemo` plus `Toggle` / `Select`. There is no `useEffect`.
```

改成：

```
Interactivity is `useState` / `useMemo` plus `Toggle` / `Select` / `Param`. There is no `useEffect`.
```

3. 「Say X → use Y」表在 `Genuine multi-row detail` 那一行之前插入：

```
| A number the user should change so other numbers update | `Param` | a native input, a slider plus a separate field, `Text` |
```

4. 在交互句后面另起一段（仍在 Components 节）：

```
`Param` only rewrites numbers already in the canvas. Do not use it to switch symbols, switch timeframes, or trigger a new fetch. Give both `min` and `max` or neither — one side alone is rejected at save. Native `<input>` / `<textarea>` are rejected; use `Param` / `Toggle` / `Select`.
```

不要翻译 skill 规则正文。不要改 workflow 里「Banned in source」那条禁词表（`checkCanvasSource` 没加 `input`）。

- [ ] **Step 2: 生成 skill `.d.ts`**

Run: `pnpm --filter @kansoku/canvas types:skill`

Expected: stdout 含 `control.d.ts`。打开 `packages/core/skills/canvas/sdk/control.d.ts`，应出现：

```ts
export declare function Param({ label, value, onChange, min, max, step, unit }: {
    label: string;
    value: number;
    onChange: (next: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}): import("react").JSX.Element;
```

`packages/core/skills/canvas/sdk/index.d.ts` 应从 `./control.js` 导出 `Param`。不要手改这些文件。

- [ ] **Step 3: 回归已有测试**

Run:

```bash
pnpm --filter @kansoku/web test -- src/features/canvas/Param.test.tsx src/features/canvas/demo/kitchenSink.test.tsx
pnpm --filter @kansoku/core test -- test/canvasCheck.test.ts
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/core/skills/canvas/SKILL.md packages/core/skills/canvas/sdk
git commit -m "$(cat <<'EOF'
feat(canvas): Param 写入 canvas skill 与类型声明

EOF
)"
```

---

## Spec coverage

| Spec 条款 | Task |
| --- | --- |
| `Param` 积木、受控 `value`/`onChange`、`min`+`max` 才出滑条、`step` 缺省 1、`unit` 可选 | 1 |
| Base UI Number Field + Slider，主题、26px、2px 圆角、13px、等宽数字 | 1 |
| 失焦/回车提交，按 `step` 取整并夹区间；非法草稿不发 `onChange` | 1 |
| 滑条拖动立刻 `onChange` | 1 |
| `min > max` / `step <= 0` / 非有限 `value` 抛错 | 1 |
| 不持久化，重挂载回到默认值 | 1 |
| kitchenSink 当场算 + 合格 `RRPlan` 吃同一组数 | 1 |
| `reviewCanvasStructure` 拒原生 input 和残缺 min/max；`checkCanvasSource` 不动 | 2 |
| skill 三处 + `types:skill` | 3 |
| 不改编译 / iframe / 活行情 / 对话 / 落盘 / Pro | 全局约束，无 task 去改 |

## 不做（执行时不要顺手做）

- 独立导出 `NumberField` / `Slider`
- 用 `Param` 改 `useQuote` / `useCandles` 参数
- 画布往对话发消息
- 把用户调过的值写进 `journal/canvases/`
- 给 `Param` 开 `style`
