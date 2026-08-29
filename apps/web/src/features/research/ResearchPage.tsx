import { useDeferredValue, useEffect, useState } from 'react';
import {
  BookOpen,
  ChartCandlestick,
  FileText,
  LayoutDashboard,
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
import { canvasSlugFromResearchPath } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { CanvasFrame } from '@web/features/canvas/CanvasFrame';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { queryClient } from '@web/lib/queryClient';
import { navigate, useQueryParam } from '@web/lib/router';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { Badge, Empty, ErrorBox, Input, MarketTime, ResizablePanel, Spinner } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
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
  { key: 'canvases', label: '画布' },
];

function viewIcon(view: ResearchView) {
  if (view === 'stocks') return <BookOpen size={13} />;
  if (view === 'canvases') return <LayoutDashboard size={13} />;
  return <FileText size={13} />;
}

function explorerLabel(view: ResearchView): string {
  if (view === 'stocks') return '股票档案';
  if (view === 'canvases') return '画布';
  return '研究时间线';
}

function searchPlaceholder(view: ResearchView): string {
  if (view === 'stocks') return '搜索股票或正文';
  if (view === 'canvases') return '搜索标题或标的';
  return '搜索日期、标的或主题';
}

const EXPLORER_MIN_WIDTH = 240;
const EXPLORER_MAX_WIDTH = 520;
const EXPLORER_WIDTH_STORAGE_KEY = 'kansoku.research.explorer-width';

const styles = stylex.create({
  fullpage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    '@media (max-width: 760px)': {
      height: 'auto',
      minHeight: '100vh',
      overflow: 'visible',
    },
  },
  fullpageDesktop: {
    height: 'calc(100vh - 40px)',
    '@media (max-width: 760px)': {
      height: 'auto',
      minHeight: 'calc(100vh - 40px)',
    },
  },
  page: {
    'backgroundColor': colors.backgroundCanvas,
    'color': colors.textPrimary,
  },
  header: {
    'alignItems': 'center',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'flex': '0 0 auto',
    'gap': '20px',
    'justifyContent': 'space-between',
    'minHeight': '76px',
    'padding': '14px 14px 14px 18px',
    '@media (max-width: 760px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      padding: '14px 48px 14px 14px',
    },
  },
  headerDesktop: {
    '@media (max-width: 760px)': {
      paddingRight: '14px',
    },
  },
  title: {
    alignItems: 'center',
    display: 'flex',
    gap: '10px',
    minWidth: 0,
  },
  titleIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 176, 0, 0.08)',
    borderColor: 'rgba(255, 176, 0, 0.28)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.md,
    color: colors.accent,
    display: 'inline-flex',
    flex: '0 0 auto',
    height: '30px',
    justifyContent: 'center',
    width: '30px',
  },
  titleHeading: {
    margin: 0,
    minWidth: 0,
  },
  titleHeadingTitle: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: 0,
  },
  titleHeadingDescription: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    margin: '3px 0 0',
  },
  controls: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '8px',
    'justifyContent': 'flex-end',
    'minWidth': 0,
    '@media (max-width: 760px)': {
      flexWrap: 'wrap',
      justifyContent: 'stretch',
    },
  },
  viewSwitch: {
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'display': 'grid',
    'gridTemplateColumns': 'repeat(auto-fit, minmax(0, 1fr))',
    'height': '28px',
    'minWidth': '280px',
    'overflow': 'hidden',
    '@media (max-width: 760px)': {
      flex: '1 1 190px',
    },
  },
  viewButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'border': 'none',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.sm,
    'gap': '5px',
    'justifyContent': 'center',
    'padding': '0 10px',
    ':hover': {
      backgroundColor: colors.backgroundElement,
      color: colors.textPrimary,
    },
  },
  viewButtonDivider: {
    borderLeftColor: colors.borderStrong,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  viewButtonActive: {
    backgroundColor: 'rgba(255, 176, 0, 0.09)',
    color: colors.accent,
  },
  searchActions: {
    'alignItems': 'center',
    'display': 'flex',
    'flex': '0 0 calc(clamp(320px, 24vw, 420px) - 14px)',
    'gap': '8px',
    'minWidth': 0,
    'paddingLeft': '16px',
    '@media (max-width: 1100px)': {
      flex: '0 1 290px',
      paddingLeft: 0,
    },
    '@media (max-width: 760px)': {
      flex: '2 1 240px',
    },
  },
  search: {
    alignItems: 'center',
    display: 'flex',
    flex: '1 1 auto',
    minWidth: 0,
    position: 'relative',
  },
  searchIcon: {
    color: colors.textMuted,
    left: '9px',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: '30px',
    width: '100%',
  },
  visuallyHidden: {
    border: 0,
    clip: 'rect(0, 0, 0, 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
  },
  refresh: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '28px',
    'justifyContent': 'center',
    'padding': 0,
    'width': '28px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
  },
  newButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'fontSize': fontSizes.sm,
    'gap': '6px',
    'height': '28px',
    'padding': '0 10px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
  },
  createHint: {
    backgroundColor: 'rgba(255, 176, 0, 0.12)',
    borderRadius: radii.full,
    color: colors.accent,
    fontSize: fontSizes.sm,
    margin: '14px auto 0',
    padding: '6px 12px',
    position: 'sticky',
    top: 0,
    width: 'fit-content',
    zIndex: 1,
  },
  workspace: {
    'display': 'flex',
    'flex': '1 1 auto',
    'minHeight': 0,
    '@media (max-width: 760px)': {
      flexDirection: 'column',
    },
  },
  explorerPanel: {
    'maxWidth': 'min(520px, 46vw)',
    '@media (max-width: 760px)': {
      flex: '0 0 auto',
      maxWidth: 'none !important',
      minWidth: '0 !important',
      width: '100% !important',
    },
  },
  explorerPanelContent: {
    '@media (max-width: 760px)': {
      width: '100%',
    },
  },
  explorerPanelHandle: {
    '@media (max-width: 760px)': {
      display: 'none',
    },
  },
  explorer: {
    'backgroundColor': colors.backgroundSurface,
    'height': '100%',
    'minHeight': 0,
    'minWidth': 0,
    'overflowY': 'auto',
    '@media (max-width: 760px)': {
      borderBottomColor: colors.border,
      borderBottomStyle: 'solid',
      borderBottomWidth: '1px',
      borderRightStyle: 'none',
      maxHeight: '300px',
    },
  },
  explorerHead: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    justifyContent: 'space-between',
    letterSpacing: '0.04em',
    minHeight: '34px',
    padding: '0 12px',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  documentList: {
    display: 'flex',
    flexDirection: 'column',
  },
  documentRow: {
    'alignItems': 'stretch',
    'backgroundColor': 'transparent',
    'border': 'none',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'flexDirection': 'column',
    'gap': '4px',
    'minWidth': 0,
    'padding': '9px 12px',
    'textAlign': 'left',
    'transition': 'background-color 120ms ease',
    'width': '100%',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    ':focus-visible': {
      outline: `1px solid ${colors.borderStrong}`,
      outlineOffset: '-1px',
    },
  },
  documentRowActive: {
    'backgroundColor': 'rgba(255, 255, 255, 0.055)',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.065)',
    },
  },
  documentRowHead: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '8px',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  documentRowTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: 600,
    lineHeight: 1.3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  documentRowTitleActive: {
    color: colors.textPrimary,
  },
  documentRowDate: {
    color: colors.textMuted,
    flex: '0 0 auto',
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
  },
  documentRowDateActive: {
    color: colors.textMuted,
  },
  documentRowMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  documentRowMetaActive: {
    color: colors.textSecondary,
  },
  documentRowExcerpt: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  state: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '8px',
    justifyContent: 'center',
    minHeight: '140px',
  },
  error: {
    margin: '12px',
  },
  empty: {
    paddingInline: '14px',
  },
  reader: {
    'backgroundColor': colors.backgroundCanvas,
    'flex': '1 1 auto',
    'minHeight': 0,
    'minWidth': 0,
    'overflowY': 'auto',
    '@media (max-width: 760px)': {
      overflow: 'visible',
    },
  },
  readerDocument: {
    'margin': '0 auto',
    'padding': '24px 28px 64px',
    'width': 'min(100%, 920px)',
    '@media (max-width: 760px)': {
      padding: '20px 16px 48px',
    },
  },
  readerDocumentCanvas: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    padding: '16px 16px 0',
    width: '100%',
  },
  readerHead: {
    'alignItems': 'flex-start',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'gap': '16px',
    'justifyContent': 'space-between',
    'marginBottom': '22px',
    'paddingBottom': '18px',
    '@media (max-width: 760px)': {
      flexDirection: 'column',
    },
  },
  readerHeading: {
    minWidth: 0,
  },
  readerHeadingBadge: {
    marginBottom: '7px',
  },
  readerHeadingTitle: {
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    overflowWrap: 'anywhere',
    textWrap: 'balance',
  },
  readerMeta: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.sm,
    gap: '6px 10px',
    marginTop: '8px',
  },
  readerMetaCode: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    overflowWrap: 'anywhere',
    padding: '2px 5px',
  },
  cockpitLink: {
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
  },
  readerBody: {
    minWidth: 0,
  },
  readerBodyCanvas: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  context: {
    'backgroundColor': colors.backgroundSurface,
    'borderLeftColor': colors.border,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '1px',
    'display': 'flex',
    'flex': '0 0 clamp(320px, 24vw, 420px)',
    'flexDirection': 'column',
    'minHeight': 0,
    'minWidth': 0,
    'overflow': 'hidden',
    'width': 'clamp(320px, 24vw, 420px)',
    '@media (max-width: 1100px)': {
      flexBasis: '320px',
      width: '320px',
    },
    '@media (max-width: 760px)': {
      borderLeftStyle: 'none',
      borderTopColor: colors.border,
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      minHeight: '520px',
      width: '100%',
    },
  },
});

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
      <div {...stylex.props(styles.state)}>
        <Spinner /> 正在读取研究资料…
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (documents.length === 0)
    return <Empty className={stylex.props(styles.empty).className}>没有匹配的研究资料</Empty>;

  return (
    <div {...stylex.props(styles.documentList)}>
      {documents.map((document) => {
        const active = document.path === selectedPath;
        return (
          <button
            type="button"
            key={document.path}
            {...stylex.props(styles.documentRow, active && styles.documentRowActive)}
            aria-pressed={active}
            onClick={() => onSelect(document)}
          >
            <span {...stylex.props(styles.documentRowHead)}>
              <span
                {...stylex.props(styles.documentRowTitle, active && styles.documentRowTitleActive)}
                title={document.title}
              >
                {researchListTitle(document)}
              </span>
              {document.date && (
                <span
                  {...stylex.props(styles.documentRowDate, active && styles.documentRowDateActive)}
                >
                  {document.date.slice(5)}
                </span>
              )}
            </span>
            <span {...stylex.props(styles.documentRowMeta, active && styles.documentRowMetaActive)}>
              {researchListSecondary(document)}
            </span>
            {showExcerpts && document.excerpt && (
              <span {...stylex.props(styles.documentRowExcerpt)}>{document.excerpt}</span>
            )}
          </button>
        );
      })}
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
      <div {...stylex.props(styles.state)}>
        <Spinner /> 正在加载正文…
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (!document) return <Empty>选择一份研究资料开始阅读</Empty>;

  const cockpitSymbol = document.kind === 'stock' ? document.symbols[0] : null;
  return (
    <article
      {...stylex.props(
        styles.readerDocument,
        document.kind === 'canvas' && styles.readerDocumentCanvas,
      )}
    >
      <header {...stylex.props(styles.readerHead)}>
        <div {...stylex.props(styles.readerHeading)}>
          <Badge
            className={stylex.props(styles.readerHeadingBadge).className}
            tone={document.kind === 'stock' ? 'accent' : undefined}
          >
            {researchTypeLabel(document.type)}
          </Badge>
          <h2 {...stylex.props(styles.readerHeadingTitle)}>{document.title}</h2>
          <div {...stylex.props(styles.readerMeta)}>
            <code {...stylex.props(styles.readerMetaCode)}>{document.path}</code>
            <span>
              更新于 <MarketTime value={document.mtime} format="month-day-time" />
            </span>
            {document.origin?.eventId && <span>来自市场事件 {document.origin.eventId}</span>}
          </div>
        </div>
        {cockpitSymbol && (
          <a
            className={`btn ${stylex.props(styles.cockpitLink).className}`}
            href={`/symbol/${encodeURIComponent(`${cockpitSymbol}.US`)}`}
          >
            <ChartCandlestick size={14} /> 打开驾驶舱
          </a>
        )}
      </header>
      <div
        className={`research-reader-body ${stylex.props(styles.readerBody, document.kind === 'canvas' && styles.readerBodyCanvas).className}`}
      >
        {document.kind === 'canvas' ? (
          <ResearchCanvasBody path={document.path} />
        ) : (
          <Markdown>{document.markdown}</Markdown>
        )}
      </div>
    </article>
  );
}

function ResearchCanvasBody({ path }: { path: string }) {
  const slug = canvasSlugFromResearchPath(path);
  const { data, loading, error } = useQuery(slug ? `canvas.get:${slug}` : null, () =>
    slug ? client.canvas.get({ slug }) : Promise.reject(new Error('Invalid canvas path')),
  );
  if (loading && !data) {
    return (
      <div {...stylex.props(styles.state)}>
        <Spinner /> 正在打开画布…
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (!data || !slug) return <Empty>画布不存在</Empty>;
  return <CanvasFrame source={data.source} slug={data.slug} />;
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
    <aside {...stylex.props(styles.context)} aria-label="关联研究资料">
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
        <div {...stylex.props(styles.state)}>
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
  const canvasCount = (allDocuments ?? []).filter((item) => item.kind === 'canvas').length;
  const listLoading = deferredQuery ? searchLoading : allLoading;
  const listError = deferredQuery ? searchError : allError;
  const desktopShell = isDesktopRealtime();

  return (
    <div
      className={`fullpage research-page ${stylex.props(styles.fullpage, styles.page, desktopShell && styles.fullpageDesktop).className}`}
    >
      <header {...stylex.props(styles.header, desktopShell && styles.headerDesktop)}>
        <div {...stylex.props(styles.title)}>
          <span {...stylex.props(styles.titleIcon)}>
            <Library size={18} />
          </span>
          <div {...stylex.props(styles.titleHeading)}>
            <h1 {...stylex.props(styles.titleHeadingTitle)}>研究库</h1>
            <p {...stylex.props(styles.titleHeadingDescription)}>
              {stockCount} 篇股票档案 · {journalCount} 篇研究日志 · {canvasCount} 份画布
            </p>
          </div>
        </div>
        <div {...stylex.props(styles.controls)}>
          <div
            className={`research-view-switch ${stylex.props(styles.viewSwitch).className}`}
            role="group"
            aria-label="研究库视图"
          >
            {VIEW_OPTIONS.map((option, index) => (
              <button
                type="button"
                key={option.key}
                {...stylex.props(
                  styles.viewButton,
                  index > 0 && styles.viewButtonDivider,
                  option.key === view && styles.viewButtonActive,
                )}
                aria-pressed={option.key === view}
                onClick={() => changeView(option.key)}
              >
                {viewIcon(option.key)}
                {option.label}
              </button>
            ))}
          </div>
          {view !== 'canvases' ? (
            <button type="button" {...stylex.props(styles.newButton)} onClick={openCreateDialog}>
              <Plus size={14} /> 新建
            </button>
          ) : null}
          <div {...stylex.props(styles.searchActions)}>
            <label {...stylex.props(styles.search)}>
              <Search size={14} aria-hidden="true" {...stylex.props(styles.searchIcon)} />
              <span className={`sr-only ${stylex.props(styles.visuallyHidden).className}`}>
                搜索研究资料
              </span>
              <Input
                type="search"
                value={query}
                className={stylex.props(styles.searchInput).className}
                placeholder={searchPlaceholder(view)}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              {...stylex.props(styles.refresh)}
              aria-label="刷新研究资料"
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <div {...stylex.props(styles.workspace)}>
        <ResizablePanel
          className={`research-explorer-panel ${stylex.props(styles.explorerPanel).className}`}
          contentClassName={stylex.props(styles.explorerPanelContent).className}
          handleClassName={stylex.props(styles.explorerPanelHandle).className}
          side="start"
          defaultSize={defaultExplorerWidth()}
          minSize={EXPLORER_MIN_WIDTH}
          maxSize={EXPLORER_MAX_WIDTH}
          storageKey={EXPLORER_WIDTH_STORAGE_KEY}
          handleLabel="调整研究资料栏宽度"
        >
          <aside {...stylex.props(styles.explorer)}>
            <div {...stylex.props(styles.explorerHead)}>
              <span>{explorerLabel(view)}</span>
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
        <main {...stylex.props(styles.reader)}>
          {createHint && (
            <div {...stylex.props(styles.createHint)} role="status">
              {createHint}
            </div>
          )}
          <ResearchReader document={document} loading={documentLoading} error={documentError} />
        </main>
        {selected?.kind === 'canvas' ? null : (
          <ResearchContext
            selected={selected}
            document={document?.path === selected?.path ? document : null}
            allDocuments={allDocuments ?? []}
            onSelect={selectDocument}
            onDocumentChanged={refresh}
          />
        )}
      </div>
    </div>
  );
}
