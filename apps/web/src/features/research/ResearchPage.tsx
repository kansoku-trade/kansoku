import { useDeferredValue, useEffect, useState } from 'react';
import {
  BookOpen,
  ChartCandlestick,
  FileText,
  Library,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  ResearchCreateResult,
  ResearchDocument,
  ResearchDocumentMeta,
} from '@kansoku/core/contract/index';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { queryClient } from '@web/lib/queryClient';
import { navigate, useQueryParam } from '@web/lib/router';
import { Badge, Empty, ErrorBox, Input, MarketTime, ResizablePanel, Spinner } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { Markdown } from '../cockpit/markdown';
import { openCreateResearchDialog } from './CreateResearchDialog';
import { ResearchAssistant } from './ResearchAssistant';
import {
  kindForView,
  parseResearchView,
  relatedDocuments,
  researchListSecondary,
  researchListTitle,
  researchRoute,
  researchTypeLabel,
  type ResearchView,
  viewForKind,
} from './researchModel';

const CREATE_HINT_MS = 4000;

const VIEW_OPTIONS: { key: ResearchView; label: string }[] = [
  { key: 'stocks', label: '股票档案' },
  { key: 'journal', label: '研究日志' },
];

const EXPLORER_MIN_WIDTH = 240;
const EXPLORER_MAX_WIDTH = 520;
const EXPLORER_WIDTH_STORAGE_KEY = 'kansoku.research.explorer-width';

function defaultExplorerWidth(): number {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, viewportWidth * 0.215));
}

function ResearchExplorer({
  documents,
  selectedPath,
  showExcerpts,
  loading,
  error,
  onSelect,
}: {
  documents: ResearchDocumentMeta[];
  selectedPath: string | null;
  showExcerpts: boolean;
  loading: boolean;
  error: string | null;
  onSelect: (document: ResearchDocumentMeta) => void;
}) {
  if (loading && documents.length === 0) {
    return (
      <div className="research-explorer-state">
        <Spinner /> 正在读取研究资料…
      </div>
    );
  }
  if (error) return <ErrorBox className="research-explorer-error">{error}</ErrorBox>;
  if (documents.length === 0) return <Empty className="research-empty">没有匹配的研究资料</Empty>;

  return (
    <div className="research-document-list">
      {documents.map((document) => (
        <button
          type="button"
          key={document.path}
          className={`research-document-row${document.path === selectedPath ? ' active' : ''}`}
          aria-pressed={document.path === selectedPath}
          onClick={() => onSelect(document)}
        >
          <span className="research-document-row-head">
            <span className="research-document-row-title" title={document.title}>
              {researchListTitle(document)}
            </span>
            {document.date && (
              <span className="research-document-row-date">{document.date.slice(5)}</span>
            )}
          </span>
          <span className="research-document-row-meta">{researchListSecondary(document)}</span>
          {showExcerpts && document.excerpt && (
            <span className="research-document-row-excerpt">{document.excerpt}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ResearchReader({
  document,
  loading,
  error,
}: {
  document: ResearchDocument | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !document) {
    return (
      <div className="research-reader-state">
        <Spinner /> 正在加载正文…
      </div>
    );
  }
  if (error) return <ErrorBox className="research-reader-error">{error}</ErrorBox>;
  if (!document) return <Empty>选择一份研究资料开始阅读</Empty>;

  const cockpitSymbol = document.kind === 'stock' ? document.symbols[0] : null;
  return (
    <article className="research-reader-document">
      <header className="research-reader-head">
        <div className="research-reader-heading">
          <Badge tone={document.kind === 'stock' ? 'accent' : undefined}>
            {researchTypeLabel(document.type)}
          </Badge>
          <h2>{document.title}</h2>
          <div className="research-reader-meta">
            <code>{document.path}</code>
            <span>
              更新于 <MarketTime value={document.mtime} format="month-day-time" />
            </span>
          </div>
        </div>
        {cockpitSymbol && (
          <a
            className="btn research-cockpit-link"
            href={`/symbol/${encodeURIComponent(`${cockpitSymbol}.US`)}`}
          >
            <ChartCandlestick size={14} /> 打开驾驶舱
          </a>
        )}
      </header>
      <div className="research-reader-body">
        <Markdown>{document.markdown}</Markdown>
      </div>
    </article>
  );
}

function ResearchContext({
  selected,
  document,
  allDocuments,
  onSelect,
  onDocumentChanged,
}: {
  selected: ResearchDocumentMeta | null;
  document: ResearchDocument | null;
  allDocuments: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
  onDocumentChanged: (document?: ResearchDocument) => void;
}) {
  if (!selected) return null;
  const related = relatedDocuments(selected, allDocuments).slice(0, 8);

  return (
    <aside className="research-context" aria-label="关联研究资料">
      {document ? (
        <ResearchAssistant
          key={document.path}
          document={document}
          selected={selected}
          related={related}
          onSelect={onSelect}
          onDocumentChanged={onDocumentChanged}
        />
      ) : (
        <div className="research-reader-state">
          <Spinner /> 正在加载正文…
        </div>
      )}
    </aside>
  );
}

export function ResearchPage() {
  useTitle('研究库');
  const view = parseResearchView(useQueryParam('view'));
  const selectedPath = useQueryParam('path');
  const [query, setQuery] = useState('');
  const [createHint, setCreateHint] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const kind = kindForView(view);

  useEffect(() => {
    if (!createHint) return;
    const timer = setTimeout(() => setCreateHint(null), CREATE_HINT_MS);
    return () => clearTimeout(timer);
  }, [createHint]);

  const {
    data: allDocuments,
    error: allError,
    loading: allLoading,
    reload: reloadAll,
  } = useQuery<ResearchDocumentMeta[]>('research.list:all', () => client.research.list({}), {
    cache: false,
  });
  const {
    data: searchDocuments,
    error: searchError,
    loading: searchLoading,
    reload: reloadSearch,
  } = useQuery<ResearchDocumentMeta[]>(
    deferredQuery ? `research.list:${kind}:${deferredQuery}` : null,
    () => client.research.list({ kind, query: deferredQuery }),
    { cache: false },
  );

  const baseDocuments = (allDocuments ?? []).filter((document) => document.kind === kind);
  const visibleDocuments = deferredQuery ? (searchDocuments ?? []) : baseDocuments;
  const selected =
    visibleDocuments.find((document) => document.path === selectedPath) ??
    visibleDocuments[0] ??
    null;
  const selectedDocumentPath = selected?.path ?? null;
  const {
    data: document,
    error: documentError,
    loading: documentLoading,
    reload: reloadDocument,
  } = useQuery<ResearchDocument>(
    selectedDocumentPath ? `research.get:${selectedDocumentPath}` : null,
    () =>
      selectedDocumentPath
        ? client.research.get({ path: selectedDocumentPath })
        : Promise.reject(new Error('No research document selected')),
    { cache: false },
  );

  useEffect(() => {
    if (!selected || selected.path === selectedPath) return;
    navigate(researchRoute(view, selected.path), { replace: true });
  }, [selectedDocumentPath, selectedPath, view]);

  const selectDocument = (next: ResearchDocumentMeta) => {
    setQuery('');
    navigate(researchRoute(viewForKind(next.kind), next.path));
  };
  const changeView = (next: ResearchView) => {
    setQuery('');
    navigate(researchRoute(next));
  };
  const refresh = () => {
    reloadAll();
    reloadSearch();
    reloadDocument();
  };
  const handleResearchCreated = (result: ResearchCreateResult) => {
    queryClient.setQueryData<ResearchDocumentMeta[]>(['research.list:all'], (current) => {
      if (!current || current.some((item) => item.path === result.document.path)) return current;
      return [result.document, ...current];
    });
    queryClient.setQueryData<ResearchDocument>(
      [`research.get:${result.document.path}`],
      result.document,
    );
    reloadAll();
    if (result.existed) setCreateHint('已存在，已为你打开');
  };
  const openCreateDialog = () => openCreateResearchDialog(kind, handleResearchCreated);

  const stockCount = (allDocuments ?? []).filter((item) => item.kind === 'stock').length;
  const journalCount = (allDocuments ?? []).filter((item) => item.kind === 'journal').length;
  const listLoading = deferredQuery ? searchLoading : allLoading;
  const listError = deferredQuery ? searchError : allError;

  return (
    <div className="fullpage research-page">
      <header className="research-header">
        <div className="research-title">
          <span className="research-title-icon">
            <Library size={18} />
          </span>
          <div>
            <h1>研究库</h1>
            <p>
              {stockCount} 篇股票档案 · {journalCount} 篇研究日志
            </p>
          </div>
        </div>
        <div className="research-controls">
          <div className="research-view-switch" role="group" aria-label="研究库视图">
            {VIEW_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.key}
                className={option.key === view ? 'active' : ''}
                aria-pressed={option.key === view}
                onClick={() => changeView(option.key)}
              >
                {option.key === 'stocks' ? <BookOpen size={13} /> : <FileText size={13} />}
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="research-new" onClick={openCreateDialog}>
            <Plus size={14} /> 新建
          </button>
          <div className="research-search-actions">
            <label className="research-search">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">搜索研究资料</span>
              <Input
                type="search"
                value={query}
                placeholder={view === 'stocks' ? '搜索股票或正文' : '搜索日期、标的或主题'}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="research-refresh"
              aria-label="刷新研究资料"
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="research-workspace">
        <ResizablePanel
          className="research-explorer-panel"
          side="start"
          defaultSize={defaultExplorerWidth()}
          minSize={EXPLORER_MIN_WIDTH}
          maxSize={EXPLORER_MAX_WIDTH}
          storageKey={EXPLORER_WIDTH_STORAGE_KEY}
          handleLabel="调整研究资料栏宽度"
        >
          <aside className="research-explorer">
            <div className="research-explorer-head">
              <span>{view === 'stocks' ? '股票档案' : '研究时间线'}</span>
              <span>{visibleDocuments.length}</span>
            </div>
            <ResearchExplorer
              documents={visibleDocuments}
              selectedPath={selected?.path ?? null}
              showExcerpts={Boolean(deferredQuery)}
              loading={listLoading}
              error={listError}
              onSelect={selectDocument}
            />
          </aside>
        </ResizablePanel>
        <main className="research-reader">
          {createHint && (
            <div className="research-create-hint" role="status">
              {createHint}
            </div>
          )}
          <ResearchReader document={document} loading={documentLoading} error={documentError} />
        </main>
        <ResearchContext
          selected={selected}
          document={document?.path === selected?.path ? document : null}
          allDocuments={allDocuments ?? []}
          onSelect={selectDocument}
          onDocumentChanged={refresh}
        />
      </div>
    </div>
  );
}
