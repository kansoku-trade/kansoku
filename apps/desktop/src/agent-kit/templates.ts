import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db } from '@kansoku/core/db/index';
import type { ManifestTemplate } from './manifest.js';
import { renderPersonalMd } from './renderPersonalMd.js';
import {
  sha256,
  type AgentKitDataState,
  type PendingConflict,
  type PendingUpdate,
  type TemplateState,
} from './state.js';

export type TemplateSyncOutcome =
  | { kind: 'written'; dest: string }
  | { kind: 'conflict'; conflict: PendingConflict }
  | { kind: 'skip-user-modified'; dest: string }
  | { kind: 'skip-uptodate'; dest: string }
  | { kind: 'pending-update'; update: PendingUpdate };

export function syncTemplate(input: {
  template: ManifestTemplate;
  resourcesPath: string;
  dataRoot: string;
  db: Db;
  state: AgentKitDataState | null;
  render: (template: ManifestTemplate) => string;
}): TemplateSyncOutcome {
  const targetPath = join(input.dataRoot, input.template.dest);
  const prev = input.state?.templates[input.template.dest];
  const targetExists = existsSync(targetPath);

  if (!targetExists) {
    const content = input.render(input.template);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content, 'utf8');
    return { kind: 'written', dest: input.template.dest };
  }

  if (!prev) {
    return {
      kind: 'conflict',
      conflict: {
        dest: input.template.dest,
        templatePath: input.template.path,
        reason: 'target-exists-no-state',
      },
    };
  }

  const currentHash = sha256(readFileSync(targetPath));
  if (currentHash !== prev.initialContentHash) {
    return { kind: 'skip-user-modified', dest: input.template.dest };
  }
  if (input.template.sha256 === prev.sourceTemplateHash) {
    return { kind: 'skip-uptodate', dest: input.template.dest };
  }
  return {
    kind: 'pending-update',
    update: {
      dest: input.template.dest,
      templatePath: input.template.path,
      oldTemplateHash: prev.sourceTemplateHash,
      newTemplateHash: input.template.sha256,
    },
  };
}

export function makeRender(resourcesPath: string, db: Db): (t: ManifestTemplate) => string {
  return (t) => {
    if (t.source === 'app-config') return renderPersonalMd(db);
    return readFileSync(join(resourcesPath, 'kansoku-agent-kit', t.path), 'utf8');
  };
}

export function acceptConflictWithTemplate(input: {
  template: ManifestTemplate;
  resourcesPath: string;
  dataRoot: string;
  db: Db;
  render: (t: ManifestTemplate) => string;
  backupSuffix?: string;
}): TemplateState {
  const targetPath = join(input.dataRoot, input.template.dest);
  const bakPath = `${targetPath}.bak${input.backupSuffix ? `.${input.backupSuffix}` : ''}`;
  if (existsSync(targetPath)) copyFileSync(targetPath, bakPath);
  const content = input.render(input.template);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
  return {
    initialContentHash: sha256(content),
    sourceTemplateHash: input.template.sha256,
    writtenAt: new Date().toISOString(),
  };
}

export function keepConflictOriginal(input: {
  template: ManifestTemplate;
  dataRoot: string;
}): TemplateState {
  const targetPath = join(input.dataRoot, input.template.dest);
  const currentHash = sha256(readFileSync(targetPath));
  return {
    initialContentHash: currentHash,
    sourceTemplateHash: input.template.sha256,
    writtenAt: new Date().toISOString(),
    kept: true,
  };
}
