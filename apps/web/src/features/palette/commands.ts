import { normalizeSymbol } from '../../lib/symbol';

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  keywords: string[];
  route?: string;
  kind?: 'trainer';
}

const MAX_COMMANDS = 12;

const STATIC_COMMANDS: PaletteCommand[] = [
  { id: 'nav:home', title: '回首页', keywords: ['home'], route: '/' },
  {
    id: 'nav:research',
    title: '打开研究库',
    keywords: ['research', 'stocks', 'journal', '研究', '日志', '笔记'],
    route: '/research?view=journal',
  },
  {
    id: 'nav:chat',
    title: '打开 AI 对话',
    keywords: ['chat', 'ai', 'assistant', '对话', '助手'],
    route: '/chat',
  },
  {
    id: 'nav:canvases',
    title: '打开画布',
    keywords: ['canvas', 'canvases', '画布', '面板'],
    route: '/research?view=canvases',
  },
  { id: 'nav:settings', title: '打开设置', keywords: ['settings', 'config'], route: '/settings' },
  { id: 'nav:logs', title: '查看日志', keywords: ['logs', 'log', '日志', 'debug'], route: '/logs' },
];

const TRAINER_COMMAND: PaletteCommand = {
  id: 'action:trainer',
  title: '开始盲盘训练',
  keywords: ['trainer', 'blind', 'replay', '训练', '盲盘', '复盘'],
  kind: 'trainer',
};

function symbolCommand(sym: string): PaletteCommand {
  const short = sym.replace(/\.US$/, '');
  return {
    id: `symbol:${sym}`,
    title: `前往 ${short}`,
    hint: sym,
    keywords: [sym, short],
    route: `/symbol/${encodeURIComponent(sym)}`,
  };
}

export function buildPaletteCommands(
  query: string,
  symbols: string[],
  showTrainer = false,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const symbolCommands: PaletteCommand[] = [];
  for (const sym of symbols) {
    if (seen.has(sym)) continue;
    seen.add(sym);
    symbolCommands.push(symbolCommand(sym));
  }

  const matches = (cmd: PaletteCommand) =>
    !q ||
    cmd.title.toLowerCase().includes(q) ||
    cmd.keywords.some((k) => k.toLowerCase().includes(q));
  const staticCommands = showTrainer ? [...STATIC_COMMANDS, TRAINER_COMMAND] : STATIC_COMMANDS;
  const out = [...symbolCommands, ...staticCommands].filter(matches);

  const direct = q ? normalizeSymbol(query) : null;
  if (direct && !seen.has(direct)) out.unshift(symbolCommand(direct));

  return out.slice(0, MAX_COMMANDS);
}
