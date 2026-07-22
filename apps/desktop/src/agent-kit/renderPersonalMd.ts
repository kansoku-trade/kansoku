import type { Db } from '@kansoku/core/db/index';
import { createWatchedMarketsStore } from '@kansoku/core/marketdata/watchedMarketsStore';

export const PERSONAL_MD_RENDER_VERSION = 'app-config-v1';

function readWatchedMarkets(db: Db): string[] {
  return createWatchedMarketsStore(db).get();
}

export function renderPersonalMd(db: Db): string {
  const markets = readWatchedMarkets(db);
  return [
    '# 个人研究配置',
    '',
    '来自 App 设置（watched_markets_settings 表快照，首次生成，之后归用户）。',
    '',
    `- 关注市场：${markets.length ? markets.join(', ') : '（未配置）'}`,
    '',
  ].join('\n');
}
