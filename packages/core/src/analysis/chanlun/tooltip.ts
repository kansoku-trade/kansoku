import type {
  Bi,
  BuySellPoint,
  BuySellPointKind,
  Fenxing,
  TimeframeKey,
  Xianduan,
  Zhongshu,
} from '@kansoku/shared/types';
import { formatMarketMonthDayTime } from '@kansoku/shared/time';

const FENXING_DEFINITION: Record<Fenxing['kind'], string> = {
  top: '中间 K 高点严格最高、低点也不低于两侧',
  bottom: '中间 K 低点严格最低、高点也不高于两侧',
};
const FENXING_MEANING =
  '局部反转信号——但分型只是"结构材料"，单个分型不足以判定方向，需等下一笔配合确认。';
const FENXING_UNCONFIRMED_NOTE: Record<Fenxing['kind'], string> = {
  top: '未确认状态下，若下一根 K 线创新高，此顶分型作废',
  bottom: '未确认状态下，若下一根 K 线创新低，此底分型作废',
};
const FENXING_SIMPLIFIED_NOTE = '简化算法，仅供参考';

const BI_DEFINITION = '相邻反向分型之间的连接，至少 5 根 K 线间隔';
const BI_MEANING: Record<Bi['direction'], string> = {
  up: '短线方向已定——当前为上笔说明短线多头占优。笔本身不是趋势，随时可能被反向笔打断；只有多笔累积成线段才具备趋势意义',
  down: '短线方向已定——当前为下笔说明短线空头占优。笔本身不是趋势，随时可能被反向笔打断；只有多笔累积成线段才具备趋势意义',
};

const XIANDUAN_DEFINITION = '至少 3 笔组成，有价格覆盖';
const XIANDUAN_MEANING: Record<Xianduan['direction'], string> = {
  up: '中期趋势成型——上线段进行中即中期力量偏多。线段的"破坏"（反向段确立）通常是趋势反转的第一信号，也是构成中枢的组件',
  down: '中期趋势成型——下线段进行中即中期力量偏空。线段的"破坏"（反向段确立）通常是趋势反转的第一信号，也是构成中枢的组件',
};
const XIANDUAN_SIMPLIFIED_NOTE = '简化判定（未做特征序列分类），仅供参考';

const ZHONGSHU_DEFINITION = '连续 3 段线段的价格重叠区';
const ZHONGSHU_MEANING = [
  '多空分歧区——市场在此形成阶段性平衡。三种走向决定后市：',
  '▲ 上破 + 回踩不破 → 三类买点，趋势向上升级',
  '▼ 下破 + 反抽不破 → 三类卖点，趋势向下升级',
  '⬜ 继续震荡 → 中枢延续，等待方向选择',
].join('\n');

const BSP_LABEL: Record<BuySellPointKind, string> = {
  buy1: '一类买点',
  sell1: '一类卖点',
  buy2: '二类买点',
  sell2: '二类卖点',
  buy3: '三类买点',
  sell3: '三类卖点',
};
const BSP_MARKER_TEXT: Record<BuySellPointKind, string> = {
  buy1: '1B',
  sell1: '1S',
  buy2: '2B',
  sell2: '2S',
  buy3: '3B',
  sell3: '3S',
};
const BSP_DEFINITION: Record<BuySellPointKind, string> = {
  buy1: '下跌线段末端出现段间底背驰',
  sell1: '上涨线段末端出现段间顶背驰',
  buy2: '一类点后反弹回调不破一类点',
  sell2: '一类点后回落反抽不破一类点',
  buy3: '中枢向上突破后回调不破中枢边沿',
  sell3: '中枢向下突破后反抽不破中枢边沿',
};
const BSP_MEANING: Record<BuySellPointKind, string> = {
  buy1: '趋势转折的最强信号——价格新低但动能不足。风险："背驰不是终点"，严格执行需等次级别买点确认',
  sell1: '趋势转折的最强信号——价格新高但动能不足。风险："背驰不是终点"，严格执行需等次级别卖点确认',
  buy2: '一类点的确认——多头接手有效。相比一类点安全，代价是错过初始反弹段',
  sell2: '一类点的确认——空头接手有效。相比一类点安全，代价是错过初始下跌段',
  buy3: '中枢升级信号——多头彻底接管旧盘整区，常预示新的更高中枢形成，是"趋势中的最强买点"',
  sell3: '中枢升级信号——空头彻底接管旧盘整区，常预示新的更低中枢形成，是"趋势中的最强卖点"',
};
const BSP_SIMPLIFIED_NOTE: Partial<Record<BuySellPointKind, string>> = {
  buy1: '简化背驰面积法，仅供参考',
  sell1: '简化背驰面积法，仅供参考',
  buy3: '简化判定（跳过新线段严格确认），仅供参考',
  sell3: '简化判定（跳过新线段严格确认），仅供参考',
};

function formatBarTime(t: number): string {
  return formatMarketMonthDayTime(t, true);
}

function fmtPrice(p: number): string {
  return `$${p.toFixed(2)}`;
}

function fenxingKindLabel(kind: Fenxing['kind']): string {
  return kind === 'top' ? '顶分型' : '底分型';
}

export function fenxingTooltip(f: Fenxing, timeframe: TimeframeKey): string {
  const icon = f.kind === 'top' ? '🔺' : '🔻';
  const status = f.confirmed ? '' : '（未确认）';
  const meaning = f.confirmed
    ? FENXING_MEANING
    : `${FENXING_MEANING}${FENXING_UNCONFIRMED_NOTE[f.kind]}`;
  return [
    `${icon} ${fenxingKindLabel(f.kind)}｜${timeframe} · ${formatBarTime(f.time)} ${fmtPrice(f.price)}${status}`,
    `📖 定义：${FENXING_DEFINITION[f.kind]}`,
    `💡 含义：${meaning}`,
    FENXING_SIMPLIFIED_NOTE,
  ].join('\n');
}

export function biTooltip(b: Bi, index: number, timeframe: TimeframeKey): string {
  const icon = b.direction === 'up' ? '↗' : '↘';
  const label = b.direction === 'up' ? '上笔' : '下笔';
  const pctChange = ((b.end.price - b.start.price) / b.start.price) * 100;
  const sign = pctChange >= 0 ? '+' : '';
  return [
    `${icon} ${label}（第 ${index + 1} 笔）｜${timeframe}`,
    `起 ${formatBarTime(b.start.time)} ${fmtPrice(b.start.price)}（${fenxingKindLabel(b.start.kind)}） → 止 ${formatBarTime(b.end.time)} ${fmtPrice(b.end.price)}（${fenxingKindLabel(b.end.kind)}）`,
    `跨 ${b.bars} 根 K 线｜幅度 ${sign}${pctChange.toFixed(2)}%`,
    `📖 定义：${BI_DEFINITION}`,
    `💡 含义：${BI_MEANING[b.direction]}`,
  ].join('\n');
}

export function xianduanTooltip(x: Xianduan, index: number, timeframe: TimeframeKey): string {
  const icon = x.direction === 'up' ? '⤴' : '⤵';
  const label = x.direction === 'up' ? '上线段' : '下线段';
  const status = x.broken ? '已破坏' : '进行中';
  const endLabel = x.endTime !== null ? formatBarTime(x.endTime) : '进行中';
  return [
    `${icon} ${label}（第 ${index + 1} 段）｜${timeframe} · ${status}`,
    `由 ${x.bis.length} 笔构成｜起 ${formatBarTime(x.startTime)} → 讫 ${endLabel}`,
    `📖 定义：${XIANDUAN_DEFINITION}`,
    `💡 含义：${XIANDUAN_MEANING[x.direction]}`,
    XIANDUAN_SIMPLIFIED_NOTE,
  ].join('\n');
}

export function zhongshuTooltip(z: Zhongshu, index: number, timeframe: TimeframeKey): string {
  const status = z.endTime === null ? '盘整中' : '已终结';
  const extendSuffix = z.extendedBy.length > 0 ? `｜+${z.extendedBy.length} 段延伸` : '';
  const endLabel = z.endTime !== null ? formatBarTime(z.endTime) : '仍在延续';
  return [
    `⬛ ${timeframe} 级别中枢（第 ${index + 1} 个）｜${status}`,
    `由 ${z.coreSegments.length} 段线段构成${extendSuffix}`,
    `重叠区 [${fmtPrice(z.priceLow)}, ${fmtPrice(z.priceHigh)}]｜${formatBarTime(z.startTime)} → ${endLabel}`,
    `📖 定义：${ZHONGSHU_DEFINITION}`,
    `💡 含义：${ZHONGSHU_MEANING}`,
  ].join('\n');
}

export function buySellPointTooltip(p: BuySellPoint): string {
  const isBuy = p.kind.startsWith('buy');
  const lines = [
    `🎯 ${BSP_LABEL[p.kind]}｜${p.timeframe} · ${formatBarTime(p.time)} ${fmtPrice(p.price)}（${p.confirmed ? '已确认' : '未确认'}）`,
  ];
  if (p.refBeichi) {
    const dir = isBuy ? '下' : '上';
    lines.push(
      `背驰段：段 #${p.refBeichi.toSegmentIdx + 1} (${dir}) vs 段 #${p.refBeichi.fromSegmentIdx + 1} (${dir})`,
    );
  }
  if (p.refFirstPoint) {
    const holds = isBuy ? '>' : '<';
    lines.push(`一类点：${formatBarTime(p.refFirstPoint.time)} ${fmtPrice(p.refFirstPoint.price)}`);
    lines.push(`${isBuy ? '回调低' : '反抽高'} ${fmtPrice(p.price)} ${holds} 一类点 ✓`);
  }
  if (p.refZhongshu) {
    lines.push(
      `中枢：${formatBarTime(p.refZhongshu.startTime)} → ${formatBarTime(p.refZhongshu.endTime)}（已终结）`,
    );
    lines.push(
      `${isBuy ? '突破中枢上沿后回调不破' : '突破中枢下沿后反抽不破'}｜${isBuy ? '回调低' : '反抽高'} ${fmtPrice(p.price)} ✓`,
    );
  }
  lines.push(`📖 定义：${BSP_DEFINITION[p.kind]}`);
  lines.push(`💡 含义：${BSP_MEANING[p.kind]}`);
  const note = BSP_SIMPLIFIED_NOTE[p.kind];
  if (note) lines.push(note);
  return lines.join('\n');
}

export function buySellPointMarkerText(kind: BuySellPointKind): string {
  return BSP_MARKER_TEXT[kind];
}
