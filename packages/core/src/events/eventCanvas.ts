import { assertCanvasQuota } from '../canvas/quotaEnforce.js';
import { loadCanvas, setCanvasOrigin } from '../canvas/store.js';
import type { Db } from '../db/index.js';
import { isLicensed } from '../license/licenseGate.js';
import { CANVAS_DIR } from '../platform/env.js';
import { ClientError } from '../platform/errors.js';
import { publishEventCanvasProgress, type EventCanvasPhase } from './canvasProgress.js';
import {
  buildEventEvidencePack,
  type EventEvidencePack,
  type EventEvidencePackDeps,
} from './evidencePack.js';
import { eventCanvasSlug } from './eventCanvasSlug.js';
import { runEventCanvasPersona } from './eventCanvasPersona.js';
import { getEvent, setEventCanvasSlug } from './store.js';

export interface EventCanvasJob {
  eventId: string;
  clusterId: string;
  slug: string;
  symbols: string[];
  phase: EventCanvasPhase;
  error: string | null;
  done: Promise<void>;
}

export type EventCanvasRunner = (input: {
  pack: EventEvidencePack;
  slug: string;
  title: string;
  canvasDir: string;
}) => Promise<void>;

export interface EventCanvasRuntimeDeps extends EventEvidencePackDeps {
  canvasDir: string;
  runner: EventCanvasRunner;
  licensed?: () => boolean;
}

export interface EventCanvasRuntime {
  generate(input: { id: string }): Promise<EventCanvasJob>;
}

function snapshot(job: EventCanvasJob): EventCanvasJob {
  return {
    eventId: job.eventId,
    clusterId: job.clusterId,
    slug: job.slug,
    symbols: job.symbols,
    phase: job.phase,
    error: job.error,
    done: job.done,
  };
}

function announce(job: EventCanvasJob): void {
  publishEventCanvasProgress({
    eventId: job.eventId,
    clusterId: job.clusterId,
    slug: job.slug,
    symbols: job.symbols,
    phase: job.phase,
    error: job.error,
  });
}

export function createEventCanvasRuntime(deps: EventCanvasRuntimeDeps): EventCanvasRuntime {
  const inflight = new Map<string, EventCanvasJob>();

  return {
    async generate({ id }) {
      const current = inflight.get(id);
      if (current && (current.phase === 'queued' || current.phase === 'running')) {
        return snapshot(current);
      }

      const event = await getEvent(id, deps.db);
      if (!event) throw new ClientError(`event not found: ${id}`, undefined, 404);
      const slug = eventCanvasSlug(event.id);
      await assertCanvasQuota(deps.canvasDir, slug, (deps.licensed ?? isLicensed)());

      let settle!: { resolve: () => void; reject: (error: unknown) => void };
      const done = new Promise<void>((resolve, reject) => {
        settle = { resolve, reject };
      });
      const job: EventCanvasJob = {
        eventId: event.id,
        clusterId: event.clusterId,
        slug,
        symbols: event.symbols,
        phase: 'queued',
        error: null,
        done,
      };
      inflight.set(id, job);
      announce(job);
      const accepted = snapshot(job);

      void (async () => {
        try {
          job.phase = 'running';
          announce(job);
          const pack = await buildEventEvidencePack(event.id, deps);
          await deps.runner({
            pack,
            slug,
            title: event.payload.title,
            canvasDir: deps.canvasDir,
          });
          const saved = await loadCanvas(deps.canvasDir, slug);
          if (!saved) {
            throw new Error(`persona did not save canvas ${slug}`);
          }
          await setCanvasOrigin(deps.canvasDir, slug, {
            eventId: event.id,
            clusterId: event.clusterId,
          });
          await setEventCanvasSlug(event.id, slug, deps.db);
          job.phase = 'done';
          job.error = null;
          announce(job);
          settle.resolve();
        } catch (error) {
          job.phase = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          announce(job);
          settle.reject(error);
        }
      })();

      return accepted;
    },
  };
}

function defaultMarketDeps(): Pick<
  EventEvidencePackDeps,
  'fetchKline' | 'fetchFlow' | 'listComments' | 'listResearch'
> {
  return {
    async fetchKline(symbol, period, count) {
      const { getProvider } = await import('../marketdata/registry.js');
      const { marketOf } = await import('../symbols/symbol.utils.js');
      return getProvider(marketOf(symbol)).getKline(symbol, period, count);
    },
    async fetchFlow(symbol) {
      const { getProvider } = await import('../marketdata/registry.js');
      const { marketOf } = await import('../symbols/symbol.utils.js');
      return getProvider(marketOf(symbol)).getFlow?.(symbol) ?? [];
    },
    async listComments(symbol, date) {
      const { listComments } = await import('../ai/personas/comments.js');
      return listComments(symbol, date);
    },
    async listResearch(symbol) {
      const { researchService } = await import('../research/research.service.js');
      const docs = await researchService.list({ query: symbol });
      return docs
        .filter((doc) => doc.kind !== 'canvas' || !doc.path.includes(`event-${symbol}`))
        .slice(0, 5)
        .map((doc) => ({
          path: doc.path,
          title: doc.title,
          excerpt: doc.excerpt,
          mtime: doc.mtime,
        }));
    },
  };
}

let defaultRuntime: EventCanvasRuntime | null = null;

export function getEventCanvasRuntime(): EventCanvasRuntime {
  defaultRuntime ??= createEventCanvasRuntime({
    canvasDir: CANVAS_DIR,
    runner: ({ pack, slug, title, canvasDir }) =>
      runEventCanvasPersona({ pack, slug, title, canvasDir }),
    ...defaultMarketDeps(),
  });
  return defaultRuntime;
}

export function configureEventCanvasRuntime(runtime: EventCanvasRuntime | null): void {
  defaultRuntime = runtime;
}

export function generateEventCanvas(
  input: { id: string },
  db?: Db,
): Promise<EventCanvasJob> {
  if (db) {
    return createEventCanvasRuntime({
      db,
      canvasDir: CANVAS_DIR,
      runner: ({ pack, slug, title, canvasDir }) =>
        runEventCanvasPersona({ pack, slug, title, canvasDir }),
      ...defaultMarketDeps(),
    }).generate(input);
  }
  return getEventCanvasRuntime().generate(input);
}
