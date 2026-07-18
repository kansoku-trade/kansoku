import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { createResearchService } from "../modules/research/research.service.js";
import { textResult } from "./dataTools.js";

const searchSchema = Type.Object({ query: Type.String() });
const readDocumentSchema = Type.Object({ path: Type.String() });

export function buildResearchLibraryTools(rootDir: string): AgentTool<any>[] {
  const library = createResearchService(rootDir);
  const searchTool: AgentTool<typeof searchSchema> = {
    name: "search_research_documents",
    label: "搜索研究库",
    description: "按标题、路径、标的、摘要和正文搜索本地研究资料，最多返回 8 条元数据。",
    parameters: searchSchema,
    execute: async (_id, params) => {
      const rows = await library.list({ query: params.query });
      return textResult(JSON.stringify(rows.slice(0, 8)));
    },
  };
  const readTool: AgentTool<typeof readDocumentSchema> = {
    name: "read_research_document",
    label: "读取研究资料",
    description: "读取研究库内另一份 stocks/*.md 或 journal/**/*.md 文档。",
    parameters: readDocumentSchema,
    execute: async (_id, params) => {
      const document = await library.get({ path: params.path });
      return textResult(document.markdown);
    },
  };
  return [searchTool, readTool];
}
