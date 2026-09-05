# 画布 Param：数字框 + 滑条，当场算

日期：2026-09-05
范围：给 `@kansoku/canvas` 加一个受控数字积木 `Param`，让用户在画布里改数、旁边的 `Stat` / 图 / `RRPlan` 立刻跟着变。延续 [agent-canvas-design](./2026-08-28-agent-canvas-design.md) 里「交互只限 SDK 自带控件」的口子。存储、编译、iframe、活行情代订、对话协议都不动。

## 背景与问题

画布已经能交互，但很窄：`useState` / `useMemo` 是开放的，控件只有 `Toggle` 和 `Select`。仓位、止损、估值乘数这类「改一个数、旁边立刻变」做不了——Agent 没有数字积木，原生 `<input>` 又会拼出和产品不像的东西。

活行情钩子（[canvas-live-data](./2026-09-02-canvas-live-data-design.md)）解决的是「图是死的」，不是「用户能改假设」。两件事不混。

## 目标与非目标

**目标**

1. 用户在画布里改一个数字，同一份画布上的派生数字和图立刻变，不经过 AI。
2. Agent 只用一个积木就能排出和 `Select` 同密度的参数行，拼不歪。
3. 关掉画布或重新编译，回到源码里的默认值。

**非目标（本版明确不做）**

- 用控件切标的、切周期、触发新的取数或订阅（那是「换视角」，下一刀）。
- 把画布里填的数送回对话让 AI 重算（那是「填完丢回对话」，下一刀）。
- 普通文本框。
- 用户调过的值写进文件或挂在 iframe 外。
- 独立的 `NumberField` / `Slider` 导出——第一刀只有 `Param`。

## 设计

### 1. 只动 SDK 和 skill

`Param` 加进 `packages/canvas-sdk/src/control.tsx`（文件将超过 500 行再拆 `Param.tsx`），从 `index.tsx` 导出，写入 `names.ts` 的 `control` 组。跑 `pnpm --filter @kansoku/canvas types:skill` 重生成 `packages/core/skills/canvas/sdk/*.d.ts`。

不改：`compile.ts`、`CanvasFrame`、`postMessage`、活行情钩子、画布文件和旁边的 JSON、任何对话工具。

状态仍是 Agent 在默认导出组件里写的 `useState` / `useMemo`。没有新钩子。

免费版可用，不进 Pro 门。

### 2. 积木接口

```tsx
<Param
  label="止损"
  value={stop}
  onChange={setStop}
  min={50}
  max={70}
  step={0.05}
  unit="USD"
/>
```

| 属性 | 规则 |
| --- | --- |
| `label` | 必填。左边标签。 |
| `value` | 必填。当前数字。 |
| `onChange` | 必填。`(next: number) => void`。只在提交成功的数字时调用。 |
| `min` + `max` | 两个都给才出滑条。只给一个当作都没给：只显示数字框，save 时 `reviewCanvasStructure` 记一条。 |
| `step` | 缺省 `1`。滑条和数字框共用。`<= 0` 或非有限数是运行时错误。 |
| `unit` | 可选。跟在数字框右边，弱化色，不是输入的一部分。 |

不接收 `style`、`className`、children。

内部用 `@base-ui/react` 的 Number Field 和 Slider（与 `Select` 同一套），外观吃 `theme.ts`：底 `bgElement`、边 `border`、字 `textPrimary` / `textSecondary`，滑条走过的那段用 `accent`。高度 26px，圆角 `theme.radius`（2px），字 13px，数字 `fontMono` + `tabular-nums`。

### 3. 提交与取整

数字框有内部草稿，父级只看见合法数字。

- 框里允许暂时空着或打到一半（`-`、`61.`）。失焦或按回车才提交。
- 提交：按 `step` 取整（`Math.round(n / step) * step`），再格式化到 `step` 的小数位数（`1` → 0 位，`0.1` → 1 位，`0.05` → 2 位）。有 `min`/`max` 就夹进区间。成功才 `onChange`。
- 草稿解析失败或提交后与当前 `value` 相同：不发 `onChange`，显示回到 `value`。
- 滑条一拖就 `onChange`，不走草稿。滑条的值同样按 `step` 取整并夹区间。
- `min > max`、`step <= 0`、`value` 非有限数：组件抛错，画布 error boundary 接住。

### 4. 排版（写死，Agent 不能改）

从左到右：`标签` → `滑条（有区间才有，占掉中间剩下的宽）` → `数字框` → `单位`。

- 标签固定宽度够中文四字（止损、入场、仓位、增速）。更长不换行，超出省略。
- 数字框够 8 个数字加小数点，不被滑条挤没。
- 没有滑条时：标签 + 数字框 + 单位。数字框保持短输入，不拉满整行。
- 多个 `Param` 用现成 `Stack` 竖排。组件自己不带分组标题——分组用 `Section`。
- 不支持塞进 `Table` 单元格。

### 5. 静态检查

只改 `reviewCanvasStructure`（save 时跑，不挡 `compileCanvasSource`）。已存盘、没有输入框的旧画布照常打开。

新增两条：

1. 源码出现 `<input` 或 `<textarea`（大小写不敏感）→ `use Param / Toggle / Select, not native input`。
2. `<Param` 的属性里只出现 `min`、`max` 之一 → `Param min and max must both be set, or neither`。

`checkCanvasSource` 的禁词表不改。SDK 内部实现用原生 input 不受影响——闸的是画布源码。

### 6. skill

`packages/core/skills/canvas/SKILL.md` 改三处：

1. 控件表：`Toggle`, `Select`, `Param`。交互那句改成 `useState` / `useMemo` plus `Toggle` / `Select` / `Param`。There is no `useEffect`。
2. 对照表加一行：用户改一个数、旁边跟着变 → `Param`。不要手写框，不要把同一个数拆成滑条加输入。
3. 第一刀边界：`Param` 只改已经在画布里的数。不要拿它换标的、换周期、触发新的取数。

`control.d.ts` 由 `types:skill` 生成，不要手改。

### 7. 验收件

`apps/web/src/features/canvas/demo/kitchenSink.canvas.tsx` 加一节「当场算」：

- 三个 `Param`：入场、止损都带 `min`/`max`/`step`/`unit`；股数不带区间，示范没滑条的短数字框。
- `useMemo` 算出单笔风险，喂给旁边的 `Stat`。
- kitchenSink 里合格的那条 `RRPlan` 改吃同一组入场 / 止损；不合格的那条仍写死，继续当反例。拖滑条时只有合格那条跟着变。

`/canvases/demo` 打开就能拖。`kitchenSink.test.tsx` 仍要求 `checkCanvasSource` 和 `reviewCanvasStructure` 为空。

## 落地顺序

1. `Param` 组件 + 导出 + `names.ts`。单测覆盖滑条显隐、取整夹区间、草稿丢弃、滑条即时 `onChange`。
2. `reviewCanvasStructure` 两条新规则 + `canvasCheck.test.ts`。
3. `kitchenSink` 当场算一节。
4. skill 三处 + `types:skill`。

## 验证

1. 齐 `min`/`max` 才渲染滑条；只给 `min` 或只给 `max` 不渲染滑条，save 时有结构问题。
2. 数字框打 `61.` 再失焦：按 `step` 提交或回到原值；非法草稿不发 `onChange`。
3. 拖滑条，每次指针移动都 `onChange`，`Stat` / `RRPlan` 同步变。
4. 画布源码写 `<input />` 被 `reviewCanvasStructure` 拒绝；旧画布不含输入框的仍能编译打开。
5. 关掉画布再打开，三个 `Param` 回到 kitchenSink 源码里的默认值。
6. 免费组合下 `Param` 可用。

## 不做

- `NumberField` / `Slider` 作为独立导出。
- `Param` 改 `useQuote` / `useCandles` 的参数。
- 画布往对话发消息。
- 把用户调过的值写进 `journal/canvases/`。
- 给 `Param` 开 `style` 或自定义排版。
