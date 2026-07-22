import { Body, Controller, Get, Param, Post } from '@tsuki-hono/common';
import type { HypothesisRunCard, HypothesisStatus } from '@kansoku/shared/types';
import { ClientError } from '@kansoku/core/platform/errors';
import {
  appendRunCard,
  createHypothesis,
  listHypotheses,
  updateHypothesisStatus,
} from '@kansoku/core/journal/hypotheses';

const STATUSES: ReadonlySet<string> = new Set(['active', 'confirmed', 'invalidated', 'retired']);
const CARD_KINDS: ReadonlySet<string> = new Set(['prediction', 'trade_gate', 'note']);

function parseStatus(value: unknown): HypothesisStatus {
  if (typeof value !== 'string' || !STATUSES.has(value))
    throw new ClientError('invalid hypothesis status');
  return value as HypothesisStatus;
}

@Controller('hypotheses')
export class HypothesesController {
  @Get('/')
  async list() {
    return { ok: true, data: await listHypotheses() };
  }

  @Post('/')
  async create(
    @Body() body: { thesis?: unknown; symbol?: unknown; invalidation_notes?: unknown },
  ) {
    if (typeof body.thesis !== 'string') throw new ClientError('thesis is required');
    const notes = Array.isArray(body.invalidation_notes)
      ? body.invalidation_notes.filter((note): note is string => typeof note === 'string')
      : [];
    const data = await createHypothesis({
      thesis: body.thesis,
      ...(typeof body.symbol === 'string' && body.symbol ? { symbol: body.symbol } : {}),
      invalidation_notes: notes,
    });
    return { ok: true, data };
  }

  @Post('/:id/status')
  async status(@Param('id') id: string, @Body() body: { status?: unknown }) {
    return { ok: true, data: await updateHypothesisStatus(id, parseStatus(body.status)) };
  }

  @Post('/:id/run-cards')
  async runCard(
    @Param('id') id: string,
    @Body() body: { kind?: unknown; summary?: unknown; ref?: unknown; outcome?: unknown },
  ) {
    if (typeof body.kind !== 'string' || !CARD_KINDS.has(body.kind))
      throw new ClientError('invalid run card kind');
    if (typeof body.summary !== 'string') throw new ClientError('run card summary is required');
    const card: Omit<HypothesisRunCard, 'at'> = {
      kind: body.kind as HypothesisRunCard['kind'],
      summary: body.summary,
      ...(typeof body.ref === 'string' && body.ref ? { ref: body.ref } : {}),
      ...(body.outcome === 'support' || body.outcome === 'against' || body.outcome === 'open'
        ? { outcome: body.outcome }
        : {}),
    };
    return { ok: true, data: await appendRunCard(id, card) };
  }
}
