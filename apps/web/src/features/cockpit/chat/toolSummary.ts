const MAX_SUMMARY_LENGTH = 80;
const MAX_VISIBLE_ITEMS = 4;

export interface ToolPresentation {
  title: string;
  items: string[];
  meta?: string;
}

type ToolInput = Record<string, unknown>;

function truncate(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) return value;
  return `${value.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

function parseToolInput(input?: string): ToolInput | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ToolInput)
      : null;
  } catch {
    return null;
  }
}

function stringValue(input: ToolInput | null, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(input: ToolInput | null, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toolKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function commandTokens(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) =>
    token.replace(/^(?:"|')|(?:"|')$/g, ''),
  );
}

function isMarketSymbol(token: string): boolean {
  return /^\$?[A-Z0-9][A-Z0-9.-]*\.(?:US|HK|SH|SZ)$/i.test(token);
}

function displaySymbol(symbol: string): string {
  const normalized = symbol.replace(/^\$/, '').toUpperCase();
  return `$${normalized}`;
}

function visibleItems(items: string[]): string[] {
  if (items.length <= MAX_VISIBLE_ITEMS) return items;
  return [...items.slice(0, MAX_VISIBLE_ITEMS), `+${items.length - MAX_VISIBLE_ITEMS}`];
}

function presentBash(input: ToolInput | null, rawInput?: string): ToolPresentation {
  const command = stringValue(input, 'command');
  if (!command) {
    return {
      title: '执行数据命令',
      items: [],
      meta: summarizeToolInput(rawInput),
    };
  }

  const tokens = commandTokens(command);
  const longbridgeIndex = tokens.findIndex((token) => /(?:^|\/)longbridge$/.test(token));
  if (longbridgeIndex >= 0 && tokens[longbridgeIndex + 1] === 'quote') {
    const symbols = tokens.slice(longbridgeIndex + 2).filter(isMarketSymbol);
    if (symbols.length > 0) {
      return {
        title: '查询实时行情',
        items: visibleItems(symbols.map(displaySymbol)),
        meta: `${symbols.length} 个标的 · 长桥实时行情`,
      };
    }
  }

  return {
    title: '执行数据命令',
    items: [],
    meta: truncate(command),
  };
}

export function summarizeToolInput(input?: string): string {
  if (!input) return '';
  const firstLine = input.split('\n')[0]?.trim() ?? '';
  return truncate(firstLine);
}

export function presentToolCall(label: string, input?: string): ToolPresentation {
  const parsed = parseToolInput(input);
  const key = toolKey(label);

  if (key === 'bash') return presentBash(parsed, input);

  if (key === 'fetchkline') {
    const symbol = stringValue(parsed, 'symbol');
    const period = stringValue(parsed, 'period');
    const count = numberValue(parsed, 'count');
    return {
      title: '获取 K 线',
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: [period, count === undefined ? undefined : `${count} 根`].filter(Boolean).join(' · '),
    };
  }

  if (key === 'fetchnews') {
    const symbol = stringValue(parsed, 'symbol');
    return {
      title: '查询市场消息',
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: '当前市场消息',
    };
  }

  if (key === 'readdatapack') {
    const symbol = stringValue(parsed, 'symbol');
    return {
      title: '读取综合行情数据',
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: '行情 · 技术面 · 资金流',
    };
  }

  if (key === 'readskill') {
    const name = stringValue(parsed, 'name');
    return { title: '加载分析流程', items: name ? [name] : [] };
  }

  if (key === 'savecanvas') {
    const slug = stringValue(parsed, 'slug');
    const title = stringValue(parsed, 'title');
    return {
      title: '保存画布',
      items: title ? [title] : [],
      meta: slug,
    };
  }

  if (key === 'readcanvas') {
    const slug = stringValue(parsed, 'slug');
    return { title: '读取画布', items: [], meta: slug };
  }

  if (key === 'listcanvases') {
    return { title: '列出画布', items: [] };
  }

  if (key === 'readfile' || key === 'readresearchdocument') {
    const path = stringValue(parsed, 'path');
    return {
      title: key === 'readfile' ? '读取文件' : '读取研究资料',
      items: [],
      meta: path ? truncate(path) : summarizeToolInput(input),
    };
  }

  if (key === 'grep' || key === 'searchresearchlibrary' || key === 'searchresearchdocuments') {
    const query = stringValue(parsed, 'query') ?? stringValue(parsed, 'pattern');
    return {
      title: key === 'grep' ? '搜索文件内容' : '搜索研究资料',
      items: [],
      meta: query ? truncate(query) : summarizeToolInput(input),
    };
  }

  const semanticValue =
    stringValue(parsed, 'symbol') ??
    stringValue(parsed, 'path') ??
    stringValue(parsed, 'query') ??
    stringValue(parsed, 'name');
  return {
    title: label || '调用工具',
    items: [],
    meta: semanticValue ? truncate(semanticValue) : summarizeToolInput(input),
  };
}

export function toolRowKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}
