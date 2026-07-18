import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileDiff, History, RefreshCw, Square } from "lucide-react";
import type { ResearchDocument, ResearchDocumentMeta, ResearchEditProposal } from "@kansoku/core/contract/index";
import { useQuery } from "@web/apiHooks";
import { client } from "@web/client";
import { MarketTime, openModal, Spinner } from "@web/ui";
import { useFeature } from "@web/useFeature";
import { ChatComposer } from "../cockpit/chat/ChatComposer";
import { ConversationTranscript } from "../cockpit/chat/ConversationTranscript";
import type { TranscriptInsert } from "../cockpit/chat/transcriptTimeline";
import { LockedAiNotice } from "../LockedAiNotice";
import { openEditReview, STATUS_LABEL } from "./ResearchEditReview";
import { ResearchRefreshCard } from "./ResearchRefreshPanel";
import { researchTypeLabel } from "./researchModel";
import { useResearchChatSession } from "../cockpit/chat/useChatSession";
import { useResearchRefresh } from "./useResearchRefresh";

const PENDING_VISIBILITY_THRESHOLD = 0.6;
const HISTORY_INSERT_LIMIT = 6;

function relatedDocumentSecondary(meta: ResearchDocumentMeta): string {
  if (meta.kind === "stock") return meta.symbols.join(" · ") || researchTypeLabel(meta.type);
  return [meta.date, researchTypeLabel(meta.type)].filter(Boolean).join(" · ");
}

function RelatedMaterialsCard({
  selected,
  related,
  onSelect,
}: {
  selected: ResearchDocumentMeta;
  related: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="research-related-details">
      <button type="button" className="research-related-summary" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ChevronRight size={13} />
        <span>关联资料 · {selected.symbols.length} 个标的 · {related.length} 条相关记录</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="research-related-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
          >
        <section className="research-context-section">
          <h3>关联标的</h3>
          {selected.symbols.length > 0 ? (
            <div className="research-symbol-links">
              {selected.symbols.map((symbol) => (
                <a key={symbol} className="chip" href={`/symbol/${encodeURIComponent(`${symbol}.US`)}`}>
                  {symbol}
                </a>
              ))}
            </div>
          ) : (
            <p>这是一份全局记录，不归属于单一股票。</p>
          )}
        </section>
        <section className="research-context-section">
          <h3>相关记录</h3>
          {related.length > 0 ? (
            <div className="research-related-list">
              {related.map((relatedDocument) => (
                <button type="button" key={relatedDocument.path} onClick={() => onSelect(relatedDocument)}>
                  <span>{relatedDocument.title}</span>
                  <small>{relatedDocumentSecondary(relatedDocument)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p>暂时没有通过标的建立的关联记录。</p>
          )}
        </section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProposalFlowCard({
  proposal,
  pending,
  cardRef,
  onOpen,
}: {
  proposal: ResearchEditProposal;
  pending: boolean;
  cardRef?: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      ref={cardRef}
      className={`research-flow-card${pending ? " research-flow-card--pending" : ""}`}
      onClick={onOpen}
    >
      <FileDiff size={14} />
      <span className="research-flow-card-body">
        <span className="research-flow-card-summary">{proposal.summary}</span>
        <small>{proposal.operations.length} 处修改</small>
      </span>
      <span className="research-flow-card-status">
        <span className={`research-edit-status research-edit-status--${proposal.status}`}>
          {STATUS_LABEL[proposal.status]}
        </span>
        {pending ? null : (
          <small className="research-flow-card-time">
            <MarketTime value={proposal.resolvedAt ?? proposal.createdAt} format="month-day-time" />
          </small>
        )}
      </span>
    </button>
  );
}

function ResearchHistoryModal({
  path,
  onChanged,
}: {
  path: string;
  onChanged: (document?: ResearchDocument) => void;
}) {
  const {
    data: edits,
    error,
    loading,
    reload,
  } = useQuery<ResearchEditProposal[]>(
    `research.edits:${path}`,
    () => client.research.listEdits({ path }),
    { cache: false },
  );
  const processed = (edits ?? []).filter((proposal) => proposal.status !== "pending");

  const handleNestedChanged = (updated?: ResearchDocument) => {
    onChanged(updated);
    reload();
  };

  return (
    <div className="research-history-modal">
      {loading && !edits ? (
        <div className="research-assistant-history-state"><Spinner /> 正在读取…</div>
      ) : null}
      {error ? <div className="research-assistant-error">{error}</div> : null}
      {!loading && processed.length === 0 ? <p>还没有已处理的修改。</p> : null}
      {processed.map((proposal) => (
        <button type="button" key={proposal.id} onClick={() => openEditReview(proposal, handleNestedChanged)}>
          <span>{proposal.summary}</span>
          <small>
            {STATUS_LABEL[proposal.status]} · <MarketTime value={proposal.resolvedAt ?? proposal.createdAt} format="month-day-time" />
          </small>
        </button>
      ))}
    </div>
  );
}

function openHistoryModal(path: string, onChanged: (document?: ResearchDocument) => void): void {
  openModal({
    title: "修改历史",
    body: () => <ResearchHistoryModal path={path} onChanged={onChanged} />,
  });
}

export function ResearchAssistant({
  document,
  selected,
  related,
  onSelect,
  onDocumentChanged,
}: {
  document: ResearchDocument;
  selected: ResearchDocumentMeta;
  related: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
  onDocumentChanged: (document?: ResearchDocument) => void;
}) {
  const { state, active: aiEnabled } = useFeature("research-ai");
  const conversation = useResearchChatSession(document.path, aiEnabled);
  const [text, setText] = useState("");
  const previousBusyRef = useRef(false);
  const pendingCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const [bannerVisible, setBannerVisible] = useState(false);
  const { data: edits, reload: reloadEdits } = useQuery<ResearchEditProposal[]>(
    aiEnabled ? `research.edits:${document.path}` : null,
    () => client.research.listEdits({ path: document.path }),
    { cache: false },
  );
  const refresh = useResearchRefresh(document.path, reloadEdits, aiEnabled);

  useEffect(() => {
    if (conversation.loaded && !conversation.session) conversation.ensureSuggestions();
  }, [conversation.loaded, conversation.session, conversation.ensureSuggestions]);

  useEffect(() => {
    if (previousBusyRef.current && !conversation.busy) reloadEdits();
    previousBusyRef.current = conversation.busy;
  }, [conversation.busy, reloadEdits]);

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || conversation.busy) return;
      setText("");
      const result = await conversation.send(trimmed);
      if (!result.ok) setText(trimmed);
    },
    [conversation.busy, conversation.send],
  );

  const pickSuggestion = useCallback((question: string) => {
    void submit(question);
  }, [submit]);

  const handleChanged = useCallback(
    (updated?: ResearchDocument) => {
      reloadEdits();
      onDocumentChanged(updated);
    },
    [reloadEdits, onDocumentChanged],
  );

  const pending = useMemo(() => (edits ?? []).filter((proposal) => proposal.status === "pending"), [edits]);
  const history = useMemo(
    () => (edits ?? []).filter((proposal) => proposal.status !== "pending").slice(0, HISTORY_INSERT_LIMIT),
    [edits],
  );
  const pendingIds = pending.map((proposal) => proposal.id).join(",");

  useEffect(() => {
    setBannerVisible(false);
    const known = new Set(pending.map((proposal) => proposal.id));
    for (const id of pendingCardRefs.current.keys()) {
      if (!known.has(id)) pendingCardRefs.current.delete(id);
    }
    const elements = [...pendingCardRefs.current.values()];
    if (elements.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.pendingId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        setBannerVisible(visible.size < elements.length);
      },
      { root: null, threshold: PENDING_VISIBILITY_THRESHOLD },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [pendingIds]);

  const scrollToFirstPending = () => {
    const first = pending[0];
    if (!first) return;
    pendingCardRefs.current.get(first.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const inserts = useMemo<TranscriptInsert[]>(() => {
    const list: TranscriptInsert[] = [];
    if (refresh.task) {
      list.push({
        id: `refresh:${refresh.task.id}`,
        ts: refresh.task.startedAt,
        node: <ResearchRefreshCard task={refresh.task} />,
      });
    }
    for (const proposal of pending) {
      list.push({
        id: `proposal:${proposal.id}`,
        ts: proposal.createdAt,
        node: (
          <ProposalFlowCard
            proposal={proposal}
            pending
            cardRef={(element) => {
              if (element) {
                element.dataset.pendingId = proposal.id;
                pendingCardRefs.current.set(proposal.id, element);
              } else {
                pendingCardRefs.current.delete(proposal.id);
              }
            }}
            onOpen={() => openEditReview(proposal, handleChanged)}
          />
        ),
      });
    }
    for (const proposal of history) {
      list.push({
        id: `proposal:${proposal.id}`,
        ts: proposal.resolvedAt ?? proposal.createdAt,
        node: <ProposalFlowCard proposal={proposal} pending={false} onOpen={() => openEditReview(proposal, handleChanged)} />,
      });
    }
    return list;
  }, [refresh.task, pending, history, handleChanged]);

  if (state === "absent") {
    return (
      <div className="research-assistant research-assistant--locked">
        <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="research-assistant research-assistant--locked">
        <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />
        <LockedAiNotice message="研究库 AI（刷新文档 / 编辑审阅 / 研究对话）需要有效授权" />
      </div>
    );
  }

  return (
    <div className="research-assistant">
      <div className="research-assistant-header">
        <span className="research-assistant-title">AI 助手</span>
        <div className="research-assistant-header-actions">
          {refresh.task?.status === "running" ? (
            <button
              type="button"
              className="research-assistant-header-btn"
              aria-label="停止研究"
              title="停止研究"
              disabled={refresh.pending}
              onClick={() => void refresh.abort()}
            >
              {refresh.pending ? <Spinner /> : <Square size={14} />}
            </button>
          ) : (
            <button
              type="button"
              className="research-assistant-header-btn"
              aria-label="刷新研究"
              title="刷新研究"
              disabled={refresh.pending}
              onClick={() => void refresh.start()}
            >
              {refresh.pending ? <Spinner /> : <RefreshCw size={14} />}
            </button>
          )}
          <button
            type="button"
            className="research-assistant-header-btn"
            aria-label="修改历史"
            title="修改历史"
            onClick={() => openHistoryModal(document.path, handleChanged)}
          >
            <History size={15} />
          </button>
        </div>
      </div>

      <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />

      <ConversationTranscript
        className="research-assistant-transcript"
        rows={conversation.rows}
        inserts={inserts}
        busy={conversation.busy}
        streamText={conversation.streamText}
        liveTools={conversation.liveTools}
        suggestions={conversation.suggestions}
        emptyText="可以询问、核对或要求修改当前文档，或点上方「刷新研究」生成带来源的研究报告"
        onPickSuggestion={pickSuggestion}
      />

      {pending.length > 0 && bannerVisible ? (
        <button type="button" className="research-assistant-pending-banner" onClick={scrollToFirstPending}>
          <FileDiff size={12} /> {pending.length} 条修改待审阅
        </button>
      ) : null}

      <ChatComposer
        value={text}
        onChange={setText}
        busy={conversation.busy}
        aborting={conversation.aborting}
        placeholder="询问或修改当前文档…"
        onSubmit={(value) => void submit(value)}
        onAbort={() => void conversation.abort()}
        hint={conversation.hint}
      />
      {refresh.error ? <div className="chat-hint" role="alert">{refresh.error}</div> : null}
    </div>
  );
}
