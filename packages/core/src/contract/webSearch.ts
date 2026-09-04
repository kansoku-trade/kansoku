export interface WebSearchProviderMeta {
  id: string;
  label: string;
  envVar: string;
  signupUrl: string;
  note: string;
}

export const WEB_SEARCH_PROVIDERS: readonly WebSearchProviderMeta[] = [
  {
    id: 'tavily',
    label: 'Tavily',
    envVar: 'TAVILY_API_KEY',
    signupUrl: 'https://app.tavily.com',
    note: '返回结论加来源，最贴合分析用，免费额度每月 1000 次',
  },
  {
    id: 'exa',
    label: 'Exa',
    envVar: 'EXA_API_KEY',
    signupUrl: 'https://dashboard.exa.ai',
    note: '语义检索，长文和研报召回好，只给来源不给结论',
  },
  {
    id: 'brave',
    label: 'Brave Search',
    envVar: 'BRAVE_API_KEY',
    signupUrl: 'https://api-dashboard.search.brave.com',
    note: '传统网页索引，最快，免费额度每月 2000 次',
  },
];

export const WEB_SEARCH_PROVIDER_IDS: readonly string[] = WEB_SEARCH_PROVIDERS.map((p) => p.id);
