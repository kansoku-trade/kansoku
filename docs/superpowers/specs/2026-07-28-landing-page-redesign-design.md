# kansoku.trade 首页改版（特效向）

日期：2026-07-28
状态：已确认
依赖：[`2026-07-28-positioning-design.md`](./2026-07-28-positioning-design.md)（定位是这版的前提，先读那份）

## 目标

把 kansoku.trade 首页从 2026-07-21 那版克制的工具站，换成一个重特效的「金融风」门面，同时把新定位（能查账的 AI 看盘搭子）表达出来。

同一个域名、同一个转化入口，不是另开展示页。

## 范围

- 重做 `apps/site/src/pages/index.astro`。
- `apps/site/src/layouts/Base.astro` 的导航与页脚跟着升级（它们出现在首页上，不可能只换半边）。
- **不含**：`/pricing`、`/changelog`、`/docs`、`/about`、`/privacy`、`/terms`。这些本轮不动，视觉上会与首页有断层，后续单独跟进。
- **不含**：英文版 i18n。

## 视觉方向

「交易终端流 + 数据艺术流」的混血：

- 纯黑底 `#050505`，主色沿用现有琥珀 `#ffb000`，涨绿 `#26a69a` / 跌红 `#ef5350`。
- 等宽字体承载所有数字与状态标签；标题用无衬线重字重。
- 整页是一个仿交易终端的外壳：顶部状态条（实时 ET 时钟 + 市场状态 + `AUDIT TRAIL: ON`）、四角角标、底部状态行、CRT 扫描线。
- **特效画的必须是产品真实在做的事**，不做与产品无关的装饰（不用金色粒子星云那类）。

排除的方向及原因记录在案：机构奢华风与产品不符（Kansoku 不是私人银行），赛博 HUD 风容易滑向廉价科幻。

## 叙事骨架

三根支柱直接映射成三个段落。

### S0 · 开机自检

约 1.2 秒，可点击跳过，`localStorage` 记住只跑一次。

```
KANSOKU v0.28.0
LOCAL RUNTIME ......... OK
BROKER LINK ........... DIRECT
AUDIT TRAIL ........... ON
SCORECARD ............. LOADED
READY
```

一举三得：第一印象、掩盖 WebGL 资源加载、预告主张。

### S1 · Hero

- h1：**它说的每句话，你都能查。**
- 副文案：盘中点评、追问、深度研究——每个结论背后都挂着它查了什么、什么时候查的、原始数字是多少。**归档之后不许改口，事后按命中率记分。**
- CTA：下载 v{version} / 查看定价；下方注明 macOS · Apple Silicon · 需 longbridge CLI。

**主视觉（证据图）**：左侧文案，右侧一张 AI 判断卡居中，周围七个节点是它真实调用的工具（`fetch_kline` / `technical` / `capital-flow` / `quote` / `finance-calendar` / `news` / `positions`）。节点逐个亮起并画出连线，每个节点带参数与一个具体数字；粒子沿连线**从证据流向结论**；概率条填至 45/35/20；最后卡片盖上 `ARCHIVED · 冻结` 印章，衔接 S3。

循环三个案例：NVDA 偏多 / MU 偏空 / SMH 观望。**必须保留「观望」这一例**——定位里写明不卖买卖信号，三个案例全是方向性判断会与之矛盾。

单轮时长 **7.5 秒**。原型做过 10.5 秒，但首屏停留通常只有几秒，多数访客看不到 `ARCHIVED` 那一下；压缩后印章落在约 5.4 秒处。

### S2 · 有出处

- h2：**它查了什么，全在这儿。**
- 内容：工具调用全程留痕，点开就是详情；指标全部本机 TypeScript 实算；AI 先读你的画线再回答。
- 特效：一条工具调用时间线横向展开，每格可展开成详情面板。

### S3 · 不改口

- h2：**归档了，就赖不掉。**
- 内容：已归档的预测是冻结记录，追问只解释、不改写；三档情景概率合计 100%，每档挂触发条件。
- 特效：一张判断卡被质疑气泡反复打中，卡片纹丝不动，旁边只长出解释；概率条锁死不动。

### S4 · 有战绩

- h2：**它有判断，也有命中率。**
- 内容：判断与结果追踪、当日记分板、AI 花费流水。
- 特效：历史判断卡逐张翻出，命中打钩、落空打叉，右侧命中率数字累加。

### S5 · 密度墙

- h2：**AI 之下，是一套完整的本地看盘工具。**
- 内容：多周期 K 线、画线工具、SEPA 仪表盘、盘面与复盘、多市场、桌面原生体验。沿用现有六条清单文案。
- 本节收尾放「本地优先」四条（本地拉取 / 实算 / 存 key / 落盘），定位为**支柱的实现手段**，不作头条。
- 特效：一整块仿终端画布塞满真实截图与仿真模块，滚动时镜头在其上推移、放大、切焦点。HTML-in-Canvas 渐进增强挂在此处（见下）。

### S6 · 定价收尾

免费版即完整工具 + Pro 三项 + `$9.9/月` `$99/年` + 下载 CTA。收尾粒子聚成一行状态文本后淡出。

## 渲染架构

四层，职责不重叠：

| 层 | 技术 | 负责 |
| --- | --- | --- |
| L1 粒子 | three.js `Points` + 自定义着色器，一个全屏 canvas | S1 证据流、S6 收尾 |
| L2 数据图 | canvas 2D，每模块一个小画布 | K 线、连线与节点、概率条、命中率图 |
| L3 终端外壳 | DOM + CSS | 状态条、面板边框、角标、全部文字与 CTA |
| L4 编排 | CSS 滚动驱动动画，JS 兜底 | 段落进出、S5 镜头推移 |

**滚动引擎**用 CSS `animation-timeline: scroll() / view()`：Chrome 115+ / Firefox 132+ / Safari 26+ 均已支持（Safari 26.5 于 2026-06 修完进度精度问题），全球覆盖约 84%。其余走 `IntersectionObserver` 兜底。

**three.js 的取舍**：本页的 WebGL 需求只有一个粒子系统，手写 WebGL2 约 4–6KB 即可达成同等效果，而 three.js 明显更重且 tree-shaking 很差。经权衡仍选 three.js——开发与调试成本更低，且 S5 后续可扩展为真 3D 场景。体积代价通过分档加载消化（见性能预算）。

**实测修订（2026-07-28）**：立项时按社区较早的测量估为 ~155KB gzip，实际构建产物为 **182.6KB gzip**（原始 724KB），故预算表由 170KB 上调至 210KB。接受而非回退的理由：差额落在桌面端、海报帧之后延迟加载的 chunk 上，不进关键路径；`lite` / `still` 档不加载 three.js，移动端不付这个代价。

该选择保持廉价可逆：渲染器藏在 `ParticleRenderer` 接口之后，各段场景只调 `createParticleRenderer`，换实现只需重写 `particles/webgl.ts` 一个文件，与实施进度无关。

## 模块划分

```
apps/site/src/
  pages/index.astro              仅做构建期取数与段落组装，保持薄
  layouts/Base.astro             导航与页脚升级
  components/landing/
    Boot.astro  HeroEvidence.astro  Sourced.astro  NoRetract.astro
    Scorecard.astro  DensityWall.astro  PricingOutro.astro  TerminalChrome.astro
  scripts/landing/
    particles/engine.ts          three.js 粒子引擎，只接收一个 canvas，不碰其余 DOM
    particles/shapes.ts          目标点生成（连线路径 / 文字 / K 线）—— 纯函数
    particles/fallback2d.ts      canvas 2D 降级渲染器
    kline.ts                     合成 K 线生成，固定种子 —— 纯函数
    tier.ts                      能力分级判定 —— 纯函数
    scenes/*.ts                  各段编排
    densityWall.ts               S5 镜头 + HTML-in-Canvas 渐进增强分支
  styles/landing/*.css
```

`engine.ts` / `shapes.ts` / `kline.ts` / `tier.ts` 不依赖 DOM 全局，可直接单测。

## 数据流

**构建时**（Node）：沿用现有 `lib/releases.ts` 取版本号与 dmg 直链、`lib/pricing.ts` 取价签与 checkout 链接，全部烘进静态 HTML。

**运行时：零网络请求。** 不挂第三方分析、不引外部字体、不外链图片（截图打包进 `public/`）。页面主张「每句话都能查」，它自己的行为就该是可查的。确需埋点只能自托管。

## 合成数据标注（强制）

页面上跑的 K 线、报价、资金流数字**全部是本地确定性伪随机生成的装饰数据**，不是真实行情。终端外壳底部必须固定挂：

```
SYNTHETIC · DECORATIVE · NOT MARKET DATA
```

不标注即构成造假数据（TD-DATA-01）。等宽小字，与终端美学一致。

## 三档降级

`tier.ts` 一次性判定后写入 `<html data-tier>`，CSS 与 JS 共用。判定一律走能力检测，不嗅探 UA。

| 档 | 条件 | 表现 |
| --- | --- | --- |
| `full` | `pointer: fine` 且视口 ≥1024，WebGL2 可用，未开减少动效 | 全套：three.js 粒子约 3600、S5 镜头推移、S0 完整自检 |
| `lite` | `pointer: coarse` 或视口 <1024 或 WebGL2 不可用 | **不加载 three.js**；canvas 2D 渲染，粒子约 1200，S1 证据图简化为静态图示，S5 改普通纵向滚动，S0 缩至 0.6 秒 |
| `still` | `prefers-reduced-motion: reduce` | 仅海报帧 + CSS 淡入；零 canvas、零 rAF，S0 跳过 |

三档的**内容与排版完全一致**，只有特效强度不同。

## 性能预算

| 项 | 上限 |
| --- | --- |
| 首屏 HTML + 关键 CSS | ≤ 50KB gzip |
| 首屏 JS（分级判定 + 海报帧接管） | ≤ 10KB gzip |
| 延迟加载特效包（three.js + 场景） | ≤ 210KB gzip，**仅 `full` 档加载** |
| LCP | < 1.5s |
| CLS | 0（canvas 与图片全部写死宽高比） |
| 帧率 | `full` 桌面稳 60；`lite` 手机 ≥ 30 |

特效包在海报帧绘制完成后才开始下载，不进关键路径。粒子数带自适应：开场 60 帧测均值，帧时超 20ms 自动降一档，最多降两次。

**海报帧**：每个场景配一个纯 CSS/SVG 的静态首帧，直接写在 HTML 里，不等 JS；WebGL 就绪后 200ms 交叉淡入接管。特效是纯增强——所有文案、CTA、下载链接、价格都在静态 HTML 中，特效完全不加载页面也完整可用、可下单。

## HTML-in-Canvas 渐进增强

**核实结果（2026-07-28）**：该 API 尚未进入 Chrome 稳定版，当前在 Chromium 中位于 `chrome://flags/#canvas-draw-element` 之后，另有 Chrome 148–150 的 origin trial（需注册令牌）；预计年内视试用数据决定是否 ship。Safari/WebKit 与 Firefox/Gecko 均标注 "no implementation announced"。

因此**它只能是渐进增强，不得承载任何内容**：

- 基线：S5 用 CSS 3D 变换作用于真实 DOM，配预渲染贴图。所有浏览器一致可用。
- 增强：特性检测 `typeof ctx.drawElementImage === 'function'`（WebGL 路径为 `texElementImage2D`），存在则升级为真·活 DOM 贴图。
- 分支内任何异常 catch 后降回基线，不向上冒泡。

代价是 S5 需维护两条路径；收益是该 API 一旦 ship stable，Chrome 用户无需改代码即自动升级。

## 错误处理

页面无运行时服务端，错误面只有三处：

1. **构建期 GitHub API 失败** → 构建失败，不出假版本号。沿用现有策略。
2. **WebGL 初始化失败 / 上下文丢失** → 停在海报帧，或降至 `lite`。监听 `webglcontextlost` 尝试重建，连续失败两次永久降级。
3. **HTML-in-Canvas 分支异常** → 降回基线。

铁律：**特效层的任何异常都不得使内容层不可用。** 每个场景初始化各自包 try/catch，失败只影响自身段落。

## 测试

`apps/site` 已有 vitest（`lib/releases.test.ts`）。新增三个纯函数单测：

- `shapes.test.ts` — 目标点数量正确、均落在归一化范围内、连线路径采样分布符合预期
- `kline.test.ts` — 同种子同结果（确定性）、`high ≥ max(open, close)`、`low ≤ min(open, close)`
- `tier.test.ts` — 各能力组合返回正确档位；`prefers-reduced-motion` 永远优先

**不写自动化测试的**：WebGL 渲染结果、动画时序、视觉效果。这些靠人眼逐段验收。

构建验证：`pnpm --filter @kansoku/site build` 通过，且产物仍包含既有的全部路由页面。

## 不在本次范围

- 定位本身（见依赖的 spec）
- 其余页面的视觉改版
- 英文版 i18n
- 埋点与分析
