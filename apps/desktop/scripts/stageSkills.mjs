// electron-builder 拷 extraResources 不解引用软链接，而 .claude/skills 里的第三方
// skill 在本地是指向 .agents/skills 的软链——直接打包会产出包外死链。这里解引用
// 拷到 dist-skills；CI 上 `skills experimental_install` 只恢复 .agents/skills（不建
// .claude/skills 软链），所以缺的锁定 skill 从 .agents/skills 补齐，最后按
// skills-lock.json 校验齐全（恢复步骤没跑就在这里失败，而不是静默缺包）。
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(desktopDir, "..", "..");
const claudeSkillsDir = join(repoRoot, ".claude", "skills");
const agentsSkillsDir = join(repoRoot, ".agents", "skills");
const destDir = join(desktopDir, "dist-skills");

const copyFilter = (source) =>
  !/__pycache__|\.pyc$|\.DS_Store$|(^|\/)\.env(\.|$)/.test(source);

rmSync(destDir, { recursive: true, force: true });
for (const name of readdirSync(claudeSkillsDir)) {
  const src = join(claudeSkillsDir, name);
  if (!existsSync(src)) continue;
  cpSync(src, join(destDir, name), {
    recursive: true,
    dereference: true,
    filter: copyFilter,
  });
}

const lock = JSON.parse(readFileSync(join(repoRoot, "skills-lock.json"), "utf8"));
const lockedNames = Object.keys(lock.skills);
for (const name of lockedNames) {
  if (existsSync(join(destDir, name, "SKILL.md"))) continue;
  const fallback = join(agentsSkillsDir, name);
  if (!existsSync(join(fallback, "SKILL.md"))) continue;
  cpSync(fallback, join(destDir, name), {
    recursive: true,
    dereference: true,
    filter: copyFilter,
  });
}

const missing = lockedNames.filter(
  (name) => !existsSync(join(destDir, name, "SKILL.md")),
);
if (missing.length > 0) {
  throw new Error(
    `dist-skills 缺少 skills-lock.json 里锁定的 skill：${missing.join(", ")}——先在仓库根目录跑 pnpm install（触发 skills experimental_install）`,
  );
}

console.log(
  `skills 已解引用拷贝到 dist-skills（${readdirSync(destDir).length} 个目录，含锁定的 ${lockedNames.length} 个第三方 skill）`,
);
