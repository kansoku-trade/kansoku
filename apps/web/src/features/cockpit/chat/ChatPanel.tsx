import * as stylex from '@stylexjs/stylex';
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { MarketTime } from '@web/ui';
import { ConversationTranscript } from './ConversationTranscript';
import type { ChatMode } from './ChatDock';
import type { ChatLiveTool, ChatRow, ChatSessionInfo } from './useChatSession';
import { colors, fontSizes } from '../../../theme/tokens.stylex';

interface ChatPanelProps {
  session: ChatSessionInfo | null;
  docCreatedAt: string;
  rows: ChatRow[];
  busy: boolean;
  streamText: string;
  liveTools: ChatLiveTool[];
  suggestions: string[];
  mode: ChatMode;
  full?: boolean;
  canvasOpen?: boolean;
  userBubbleClassName?: string;
  suggestionClassName?: string;
  onDragStart?: (e: React.PointerEvent) => void;
  onModeChange: (mode: ChatMode) => void;
  onPickSuggestion: (question: string) => void;
  onOpenCanvas?: (slug: string) => void;
}

const styles = stylex.create({
  panel: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minHeight: 0,
  },
  head: {
    alignItems: 'baseline',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    gap: '8px',
    padding: '8px 12px',
  },
  fullHead: {
    padding: '10px max(12px, calc((100% - 68ch) / 2))',
  },
  canvasOpenHead: {
    paddingLeft: '16px',
    paddingRight: '16px',
  },
  draggable: {
    'cursor': 'grab',
    'touchAction': 'none',
    ':active': {
      cursor: 'grabbing',
    },
  },
  title: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: fontSizes.base,
    fontWeight: 600,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    color: colors.textSecondary,
    flexShrink: 0,
    fontSize: fontSizes.sm,
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    gap: '2px',
    marginLeft: 'auto',
  },
  actionButton: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'flex',
    'padding': '2px',
    ':hover': {
      color: colors.textPrimary,
    },
  },
  body: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minHeight: 0,
  },
  bodyViewport: {
    flex: '1 1 auto',
    minHeight: 0,
    height: 'auto',
  },
  bodyContent: {
    padding: '10px 12px',
    gap: '8px',
  },
});

export function ChatPanel({
  session,
  docCreatedAt,
  rows,
  busy,
  streamText,
  liveTools,
  suggestions,
  mode,
  full = false,
  canvasOpen = false,
  userBubbleClassName,
  suggestionClassName,
  onDragStart,
  onModeChange,
  onPickSuggestion,
  onOpenCanvas,
}: ChatPanelProps) {
  return (
    <div className={`chat-panel ${stylex.props(styles.panel).className}`}>
      <div
        className={`chat-panel-head${onDragStart ? ' draggable' : ''} ${stylex.props(styles.head, full && styles.fullHead, canvasOpen && styles.canvasOpenHead, onDragStart && styles.draggable).className}`}
        onPointerDown={onDragStart}
      >
        <span className={`chat-panel-title ${stylex.props(styles.title).className}`}>
          {session?.title ?? '新的追问'}
        </span>
        <span className={`chat-panel-subtitle ${stylex.props(styles.subtitle).className}`}>
          关于 <MarketTime value={docCreatedAt} format="clock" /> 的分析
        </span>
        <div className={`chat-panel-actions ${stylex.props(styles.actions).className}`}>
          <button
            className={stylex.props(styles.actionButton).className}
            onClick={() => onModeChange(mode === 'full' ? 'float' : 'full')}
            aria-label={mode === 'full' ? '退出全屏' : '全屏'}
            title={mode === 'full' ? '退出全屏（Esc）' : '全屏'}
          >
            {mode === 'full' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            className={stylex.props(styles.actionButton).className}
            onClick={() => onModeChange('dock')}
            aria-label="收起"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <ConversationTranscript
        className={`chat-panel-body ${stylex.props(styles.body).className}`}
        viewportClassName={stylex.props(styles.bodyViewport).className}
        contentClassName={!full ? stylex.props(styles.bodyContent).className : undefined}
        full={full}
        canvasOpen={canvasOpen}
        userBubbleClassName={userBubbleClassName}
        suggestionClassName={suggestionClassName}
        rows={rows}
        busy={busy}
        streamText={streamText}
        liveTools={liveTools}
        suggestions={suggestions}
        emptyText="还没有对话，在下方输入你的问题"
        onPickSuggestion={onPickSuggestion}
        onOpenCanvas={onOpenCanvas}
      />
    </div>
  );
}
