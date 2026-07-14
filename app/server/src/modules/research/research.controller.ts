import { Controller, Get, Query } from "@tsuki-hono/common";
import type { ResearchKind } from "../../../../packages/core/src/contract/research.js";
import { ClientError } from "../../../../packages/core/src/errors.js";
import { researchService } from "../../../../packages/core/src/modules/research/research.service.js";

function parseKind(value: string | undefined): ResearchKind | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "stock" || value === "journal") return value;
  throw new ClientError("invalid research kind", "expected stock or journal");
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
    if (!path) throw new ClientError("research document path is required");
    const data = await researchService.get({ path });
    return { ok: true, data };
  }
}
