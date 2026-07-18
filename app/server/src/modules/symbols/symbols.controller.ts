import { Controller, ContextParam, Delete, Get, Param, Post, Query } from "@tsuki-hono/common";
import type { Context } from "hono";
import { symbolsService } from "../../../../packages/core/src/modules/symbols/symbols.service.js";
import { ClientError } from "../../../../packages/core/src/errors.js";
import { requirePro } from "../../../../packages/core/src/pro/requirePro.js";

@Controller("symbols")
export class SymbolsController {
  @Get("/:sym/flow")
  async getFlow(@Param("sym") sym: string) {
    const data = await symbolsService.flow({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/benchmark")
  async getBenchmark(@Param("sym") sym: string) {
    const data = await symbolsService.benchmark({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/position")
  async getPosition(@Param("sym") sym: string) {
    const data = await symbolsService.position({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/analyses")
  async getAnalyses(@Param("sym") sym: string) {
    const data = await symbolsService.analyses({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/relvol")
  async getRelvol(@Param("sym") sym: string) {
    const data = await symbolsService.relvol({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/comments")
  async getComments(@Param("sym") sym: string, @Query("date") date: string | undefined) {
    const data = await symbolsService.comments({ sym, date });
    return { ok: true, data };
  }

  @Get("/:sym/comment-dates")
  async getCommentDates(@Param("sym") sym: string) {
    const data = await symbolsService.commentDates({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/follow")
  async getFollowStatus(@Param("sym") sym: string) {
    const data = await symbolsService.followStatus({ sym });
    return { ok: true, data };
  }

  @Post("/:sym/follow")
  async startFollow(@Param("sym") sym: string) {
    const data = await symbolsService.startFollow({ sym });
    return { ok: true, data };
  }

  @Delete("/:sym/follow")
  async stopFollow(@Param("sym") sym: string) {
    const data = await symbolsService.stopFollow({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/journal")
  async getJournal(@Param("sym") sym: string) {
    const data = await symbolsService.journal({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/journal/:name")
  async getJournalEntry(@Param("sym") sym: string, @Param("name") name: string) {
    const data = await symbolsService.journalEntry({ sym, name });
    return { ok: true, data };
  }

  @Post("/:sym/reassess")
  async reassess(@Param("sym") sym: string) {
    const data = await symbolsService.reassess({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/reassess/status")
  async getReassessStatus(@Param("sym") sym: string) {
    const data = await symbolsService.reassessStatus({ sym });
    return { ok: true, data };
  }

  @Get("/:sym/note")
  async getNote(@Param("sym") sym: string) {
    return symbolsService.note({ sym });
  }

  @Post("/:sym/deep-dive")
  async postDeepDive(@Param("sym") sym: string, @ContextParam() ctx: Context) {
    requirePro();
    const result = await symbolsService.deepDive({ sym });
    if (result.started) return ctx.json({ ok: true }, 202);
    if (result.reason === "busy") {
      throw new ClientError(`deep dive already running`, "wait for the current run to finish", 409);
    }
    throw new ClientError(`deep dive disabled`, "未配置深度研究模型，请在 /settings 配置", 503);
  }

  @Get("/:sym/deep-dive/status")
  async getDeepDiveStatus(@Param("sym") sym: string) {
    requirePro();
    return symbolsService.deepDiveStatus({ sym });
  }

  @Get("/:sym/latest")
  async getLatest(@Param("sym") sym: string) {
    const data = await symbolsService.latest({ sym });
    return { ok: true, data };
  }
}
