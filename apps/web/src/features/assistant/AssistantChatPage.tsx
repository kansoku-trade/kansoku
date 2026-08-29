import { useEffect, useMemo, useState } from 'react';
import type { ResearchDocumentMeta } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { navigate, useQueryParam } from '@web/lib/router';
import { Button, Empty, Spinner } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { saveRole } from '../settings/roleShared';
import type { AiSettings, Catalog } from '../settings/types';
import { AssistantConversation } from './AssistantConversation';
import { AssistantSessionList } from './AssistantSessionList';
import {
  assistantModelLabels,
  buildAssistantModelChoices,
  resolveAssistantModelValue,
  roleSettingForAssistantModel,
} from './assistantModels';
import { resolveActiveSessionId } from './assistantPageState.js';
import { useAssistantSessions } from './useAssistantSessions';
import { colors } from '../../theme/tokens.stylex';

const styles = stylex.create({
  page: {
    backgroundColor: colors.backgroundCanvas,
    color: colors.textPrimary,
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    minHeight: 0,
  },
  main: {
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
  },
  empty: {
    alignItems: 'center',
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '12px',
    justifyContent: 'center',
  },
});

function assistantRoute(id: string | null): string {
  return id ? `/chat?session=${encodeURIComponent(id)}` : '/chat';
}

export function AssistantChatPage() {
  useTitle('AI 对话');
  const { sessions, loading, error, refresh, create, remove } = useAssistantSessions();
  const requestedId = useQueryParam('session');
  const activeId = resolveActiveSessionId(requestedId, sessions);

  const aiSettingsQuery = useQuery<AiSettings>('settings.getAi', () => client.settings.getAi());
  const catalogQuery = useQuery<Catalog>('settings.getCatalog', () => client.settings.getCatalog());
  const { data: library } = useQuery<ResearchDocumentMeta[]>('assistant.researchLibrary', () =>
    client.research.list({}),
  );
  const aiSettings = aiSettingsQuery.data;
  const catalog = catalogQuery.data;
  const [pendingModelValue, setPendingModelValue] = useState<string | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const modelChoices = useMemo(
    () => (catalog ? buildAssistantModelChoices(catalog) : []),
    [catalog],
  );
  const configuredModelValue = aiSettings ? resolveAssistantModelValue(aiSettings.roles) : '';
  const selectedModelValue = pendingModelValue ?? configuredModelValue;
  const modelLabels = useMemo(() => (catalog ? assistantModelLabels(catalog) : {}), [catalog]);
  const mentionCandidates = useMemo(
    () => (library ?? []).map((doc) => ({ path: doc.path, title: doc.title })),
    [library],
  );

  useEffect(() => {
    if (loading) return;
    if (activeId !== requestedId) navigate(assistantRoute(activeId), { replace: true });
  }, [activeId, requestedId, loading]);

  useEffect(() => {
    if (!modelSaving && pendingModelValue && pendingModelValue === configuredModelValue) {
      setPendingModelValue(null);
    }
  }, [configuredModelValue, modelSaving, pendingModelValue]);

  const handleModelChange = async (value: string) => {
    if (modelSaving || value === selectedModelValue) return;
    const choice = modelChoices.find((entry) => entry.value === value);
    if (!choice) return;
    setPendingModelValue(value);
    setModelSaving(true);
    setModelError(null);
    try {
      await saveRole('chat', roleSettingForAssistantModel(choice));
      aiSettingsQuery.reload();
    } catch (error) {
      setPendingModelValue(null);
      setModelError(errorMessage(error));
    } finally {
      setModelSaving(false);
    }
  };

  const handleCreate = async () => {
    const created = await create();
    navigate(assistantRoute(created.id));
  };

  const handleDelete = async (id: string) => {
    await remove(id);
  };

  return (
    <div className={`fullpage ${stylex.props(styles.page).className}`}>
      <AssistantSessionList
        sessions={sessions}
        activeId={activeId}
        loading={loading}
        error={error}
        onSelect={(id) => navigate(assistantRoute(id))}
        onCreate={() => void handleCreate()}
        onDelete={(id) => void handleDelete(id)}
      />
      <div {...stylex.props(styles.main)}>
        {activeId ? (
          <AssistantConversation
            key={activeId}
            sessionId={activeId}
            refreshSessions={refresh}
            mentionCandidates={mentionCandidates}
            modelChoices={modelChoices}
            selectedModelValue={selectedModelValue}
            modelSaving={modelSaving}
            modelError={modelError}
            modelLabels={modelLabels}
            onModelChange={(value) => void handleModelChange(value)}
          />
        ) : loading ? (
          <div className="assistant-sidebar-state">
            <Spinner /> 正在读取会话…
          </div>
        ) : (
          <Empty className={stylex.props(styles.empty).className}>
            <p>选一个会话，或者新建一个开始对话</p>
            <Button accent onClick={() => void handleCreate()}>
              新建会话
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
}
