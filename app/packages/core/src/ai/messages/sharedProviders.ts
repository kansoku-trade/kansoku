import { join } from "node:path";
import type { SkillMeta } from "../../services/skills.js";
import { BaseFirstUserContentProvider } from "./messageEngine.js";

export interface SkillContext {
  activated: boolean;
  content?: string;
  description: string;
  location?: string;
  name: string;
}

export interface RunMetadataContext {
  agent: string;
  symbol: string;
  origin?: string;
  startedAt: string;
  marketDate?: string;
  dataAsOf?: string;
}

export const toSkillContexts = (index: SkillMeta[]): SkillContext[] =>
  index.map((skill) => ({
    activated: false,
    description: skill.description,
    location: join(skill.dir, "SKILL.md"),
    name: skill.name,
  }));

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const safeJson = (value: unknown): string =>
  (JSON.stringify(value) ?? "null").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");

export class SkillCatalogProvider extends BaseFirstUserContentProvider {
  readonly name = "SkillCatalogProvider";

  constructor(private readonly skills: SkillContext[]) {
    super();
  }

  protected buildContent(): string | null {
    if (this.skills.length === 0) return null;
    const lines = [
      "<available_skills>",
      "以下列出项目中的全部技能；description 说明技能的用途与适用时机。",
    ];
    for (const skill of this.skills) {
      const attrs = [
        `name=\"${escapeXml(skill.name)}\"`,
        `status=\"${skill.activated ? "activated" : "available"}\"`,
        skill.location ? `location=\"${escapeXml(skill.location)}\"` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      const invoke = skill.activated
        ? "技能说明已在下方加载"
        : `read_skill(name=\"${escapeXml(skill.name)}\")`;
      lines.push(
        `  <skill ${attrs}>`,
        `    <description>${escapeXml(skill.description)}</description>`,
        `    <invoke>${invoke}</invoke>`,
        "  </skill>",
      );
    }
    lines.push("</available_skills>");
    return lines.join("\n");
  }
}

export class ActivatedSkillsProvider extends BaseFirstUserContentProvider {
  readonly name = "ActivatedSkillsProvider";

  constructor(
    private readonly skills: SkillContext[],
    private readonly runtimeAdapter?: string,
  ) {
    super();
  }

  protected buildContent(): string | null {
    const activated = this.skills.filter((skill) => skill.activated && skill.content);
    if (activated.length === 0) return null;

    const lines = [
      "<activated_skills>",
      "以下技能已为本次运行激活；直接遵循其说明，无需再次调用 read_skill。",
    ];
    for (const skill of activated) {
      lines.push(
        `  <skill name=\"${escapeXml(skill.name)}\">`,
        skill.content!,
        "  </skill>",
      );
    }
    lines.push("</activated_skills>");
    if (this.runtimeAdapter?.trim()) {
      lines.push("<runtime_adapter>", this.runtimeAdapter, "</runtime_adapter>");
    }
    return lines.join("\n");
  }
}

export class RunMetadataProvider extends BaseFirstUserContentProvider {
  readonly name = "RunMetadataProvider";

  constructor(private readonly context: RunMetadataContext) {
    super();
  }

  protected buildContent(): string {
    const context = this.context;
    const lines = [
      "<run_metadata>",
      `  <agent>${escapeXml(context.agent)}</agent>`,
      `  <symbol>${escapeXml(context.symbol)}</symbol>`,
      `  <origin>${escapeXml(context.origin ?? "manual")}</origin>`,
      `  <started_at>${escapeXml(context.startedAt)}</started_at>`,
    ];
    if (context.marketDate !== undefined) {
      lines.push(`  <market_date>${escapeXml(context.marketDate)}</market_date>`);
    }
    if (context.dataAsOf !== undefined) {
      lines.push(`  <data_as_of>${escapeXml(context.dataAsOf)}</data_as_of>`);
    }
    lines.push("</run_metadata>");
    return lines.join("\n");
  }
}
