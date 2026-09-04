#!/usr/bin/env node
import { auditSkills, formatSkillAudit } from '../packages/core/src/ai/agents/skillsAudit.ts';

const audit = auditSkills();
console.log(formatSkillAudit(audit));
console.log(
  `\n${audit.rows.filter((r) => r.appVisible).length} app-visible, ${audit.rows.filter((r) => !r.appVisible).length} agent-only`,
);
if (audit.staleAgentOnly.length > 0) {
  console.warn(`\nwarning: agentOnly names with no directory: ${audit.staleAgentOnly.join(', ')}`);
}
