export type SearchRecency = 'day' | 'week' | 'month' | 'year';

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
}

export interface SearchRequest {
  query: string;
  recency?: SearchRecency;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SearchResponse {
  provider: string;
  answer?: string;
  sources: SearchSource[];
}

export interface SearchAdapter {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  search(request: SearchRequest): Promise<SearchResponse>;
}

export class SearchAdapterError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'SearchAdapterError';
  }
}

export function hasRenderableContent(response: SearchResponse): boolean {
  return Boolean(response.answer?.trim()) || response.sources.length > 0;
}
