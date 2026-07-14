import { Body, Controller, Get, Param, Post, Query } from "@tsuki-hono/common";
import type { ResearchKind } from "../../../../packages/core/src/contract/research.js";
import { ClientError } from "../../../../packages/core/src/errors.js";
import {
  applyResearchEditProposal,
  listResearchEditProposals,
  rejectResearchEditProposal,
  undoResearchEditProposal,
} from "../../../../packages/core/src/modules/research/researchEdit.service.js";
import { researchChatService } from "../../../../packages/core/src/modules/research/researchChat.service.js";
import { researchRefreshService } from "../../../../packages/core/src/modules/research/researchRefresh.service.js";
import { researchService } from "../../../../packages/core/src/modules/research/research.service.js";
import { jsonResponse } from "../../httpResponse.js";

function parseKind(value: string | undefined): ResearchKind | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "stock" || value === "journal") return value;
  throw new ClientError("invalid research kind", "expected stock or journal");
}

function requirePath(path: unknown): string {
  if (typeof path !== "string" || !path) throw new ClientError("research document path is required");
  return path;
}

@Controller("research")
export class ResearchController {
  @Get("/")
  async list(@Query() query: { kind?: string; query?: string }) {
    const data = await researchService.list({ kind: parseKind(query.kind), query: query.query });
    return { ok: true, data };
  }

  @Get("/document")
  async get(@Query("path") path: string | undefined) {
    const data = await researchService.get({ path: requirePath(path) });
    return { ok: true, data };
  }

  @Get("/chat")
  async getChat(@Query("path") path: string | undefined) {
    return researchChatService.getChat({ path: requirePath(path) });
  }

  @Post("/chat/messages")
  async postMessage(@Body() body: { path?: unknown; text?: unknown } | null) {
    const path = requirePath(body?.path);
    if (typeof body?.text !== "string") {
      throw new ClientError("`text` must be a non-empty string of at most 4000 characters", '{"text":"..."}');
    }
    const result = await researchChatService.postMessage({ path, text: body.text });
    return jsonResponse(result.status, result.body);
  }

  @Post("/chat/abort")
  async abortChat(@Body() body: { path?: unknown } | null) {
    const result = await researchChatService.abortChat({ path: requirePath(body?.path) });
    return jsonResponse(result.status, result.body);
  }

  @Get("/chat/suggestions")
  async suggestions(@Query("path") path: string | undefined) {
    return researchChatService.suggestions({ path: requirePath(path) });
  }

  @Get("/refresh")
  async getRefresh(@Query("path") path: string | undefined) {
    const data = await researchRefreshService.getRefresh({ path: requirePath(path) });
    return { ok: true, data };
  }

  @Post("/refresh")
  async startRefresh(@Body() body: { path?: unknown; objective?: unknown } | null) {
    if (body?.objective !== undefined && typeof body.objective !== "string") {
      throw new ClientError("research objective must be a string");
    }
    const data = await researchRefreshService.startRefresh({
      path: requirePath(body?.path),
      objective: body?.objective as string | undefined,
    });
    return { ok: true, data };
  }

  @Post("/refresh/abort")
  async abortRefresh(@Body() body: { path?: unknown } | null) {
    const data = await researchRefreshService.abortRefresh({ path: requirePath(body?.path) });
    return { ok: true, data };
  }

  @Get("/edits")
  async listEdits(@Query("path") path: string | undefined) {
    const data = await listResearchEditProposals(requirePath(path));
    return { ok: true, data };
  }

  @Post("/edits/:id/apply")
  async applyEdit(
    @Param("id") id: string,
    @Body() body: { path?: unknown; operationIndexes?: unknown } | null,
  ) {
    const operationIndexes = body?.operationIndexes;
    if (
      operationIndexes !== undefined &&
      (!Array.isArray(operationIndexes) || operationIndexes.some((index) => typeof index !== "number"))
    ) {
      throw new ClientError("operationIndexes must be an array of numbers");
    }
    const data = await applyResearchEditProposal({
      id,
      path: requirePath(body?.path),
      operationIndexes: operationIndexes as number[] | undefined,
    });
    return { ok: true, data };
  }

  @Post("/edits/:id/reject")
  async rejectEdit(@Param("id") id: string, @Body() body: { path?: unknown } | null) {
    const data = await rejectResearchEditProposal({ id, path: requirePath(body?.path) });
    return { ok: true, data };
  }

  @Post("/edits/:id/undo")
  async undoEdit(@Param("id") id: string, @Body() body: { path?: unknown } | null) {
    const data = await undoResearchEditProposal({ id, path: requirePath(body?.path) });
    return { ok: true, data };
  }
}
