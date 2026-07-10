import { BadRequestException, type ArgumentsHost, type ExceptionFilter } from "@tsuki-hono/common";
import { ClientError } from "../errors.js";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isMalformedJsonBody(exception: unknown): boolean {
  if (!(exception instanceof BadRequestException)) return false;
  const response = exception.getResponse<{ message?: unknown }>();
  return typeof response === "object" && response !== null && response.message === "Invalid JSON payload";
}

export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): Response {
    if (exception instanceof ClientError) {
      return jsonResponse(exception.status, { ok: false, error: exception.message, hint: exception.hint });
    }
    // mirrors Fastify's FST_ERR_CTP* body-parse error handling (see src/app.ts) —
    // Tsuki's @Body() decorator throws this on unparseable JSON.
    if (isMalformedJsonBody(exception)) {
      return jsonResponse(400, {
        ok: false,
        error: "request body must be JSON",
        hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
      });
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    console.error(error);
    return jsonResponse(500, { ok: false, error: error.message });
  }
}
