import { ArrowUpRight } from 'lucide-react';
import type { ResearchDocument, ResearchDocumentMeta } from '@kansoku/core/contract/index';
import { useFeature } from '@web/features/edition/useFeature';
import { LockedAiNotice } from '../cockpit/LockedAiNotice';
import { RelatedMaterialsCard } from './RelatedMaterialsCard';

export interface ResearchAssistantProps {
  document: ResearchDocument;
  selected: ResearchDocumentMeta;
  related: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
  onDocumentChanged: (document?: ResearchDocument) => void;
}

export function ResearchAssistant({ document, selected, related, onSelect }: ResearchAssistantProps) {
  const { state } = useFeature('research-ai');

  if (state === 'absent') {
    return (
      <div className="research-assistant research-assistant--locked">
        <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div className="research-assistant research-assistant--locked">
        <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />
        <LockedAiNotice message="研究库 AI（刷新文档 / 编辑审阅 / 研究对话）需要有效授权" />
      </div>
    );
  }

  return (
    <div className="research-assistant">
      <RelatedMaterialsCard selected={selected} related={related} onSelect={onSelect} />
      <a
        className="btn research-assistant-open-link"
        href={`/research/assistant?path=${encodeURIComponent(document.path)}`}
      >
        打开 AI 助手 <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
