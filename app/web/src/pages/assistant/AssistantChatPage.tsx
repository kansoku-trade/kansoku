import { useEffect, useMemo, useState } from "react";
import type { ResearchDocumentMeta } from "../../../../packages/core/src/contract";
import { errorMessage } from "../../api";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { navigate, useQueryParam } from "../../router";
import { Button, Empty, Spinner } from "../../ui";
import { useTitle } from "../../useTitle";
import { saveRole } from "../settings/roleShared";
import type { AiSettings, Catalog } from "../settings/types";
import { AssistantConversation } from "./AssistantConversation";
import { AssistantSessionList } from "./AssistantSessionList";
import {
  assistantModelLabels,
  buildAssistantModelChoices,
  resolveAssistantModelValue,
  roleSettingForAssistantModel,
} from "./assistantModels";
import { resolveActiveSessionId } from "./assistantPageState.js";
import { useAssistantSessions } from "./useAssistantSessions";

function assistantRoute(id: string | null): string {
  return id ? `/chat?session=${encodeURIComponent(id)}` : "/chat";
}

export function AssistantChatPage() {
  useTitle("AI 对话");
  const { sessions, loading, error, refresh, create, remove } = useAssistantSessions();
  const requestedId = useQueryParam("session");
  const activeId = resolveActiveSessionId(requestedId, sessions);

  const aiSettingsQuery = useQuery<AiSettings>("settings.getAi", () => client.settings.getAi());
  const catalogQuery = useQuery<Catalog>("settings.getCatalog", () => client.settings.getCatalog());
  const { data: library } = useQuery<ResearchDocumentMeta[]>("assistant.researchLibrary", () => client.research.list({}));
  const aiSettings = aiSettingsQuery.data;
  const catalog = catalogQuery.data;
  const [pendingModelValue, setPendingModelValue] = useState<string | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const modelChoices = useMemo(() => (catalog ? buildAssistantModelChoices(catalog) : []), [catalog]);
  const configuredModelValue = aiSettings ? resolveAssistantModelValue(aiSettings.roles) : "";
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
      await saveRole("chat", roleSettingForAssistantModel(choice));
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
    <div className="fullpage assistant-page">
      <AssistantSessionList
        sessions={sessions}
        activeId={activeId}
        loading={loading}
        error={error}
        onSelect={(id) => navigate(assistantRoute(id))}
        onCreate={() => void handleCreate()}
        onDelete={(id) => void handleDelete(id)}
      />
      <div className="assistant-main">
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
          <Empty className="assistant-empty">
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
