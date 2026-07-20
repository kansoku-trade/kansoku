import { BadRequestException, type ArgumentsHost, type ExceptionFilter } from '@tsuki-hono/common';
import { ClientError } from '@kansoku/core/platform/errors';
import { jsonResponse } from '../httpResponse.js';

function isMalformedJsonBody(exception: unknown): boolean {
  if (!(exception instanceof BadRequestException)) return false;
  const response = exception.getResponse<{ message?: unknown }>();
  return (
    typeof response === 'object' && response !== null && response.message === 'Invalid JSON payload'
  );
}

export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): Response {
    if (exception instanceof ClientError) {
      return jsonResponse(exception.status, {
        ok: false,
        error: exception.message,
        hint: exception.hint,
        code: exception.code,
      });
    }
    // Tsuki's @Body() decorator throws BadRequestException("Invalid JSON payload")
    // on unparseable JSON; map it to this repo's envelope shape.
    if (isMalformedJsonBody(exception)) {
      return jsonResponse(400, {
        ok: false,
        error: 'request body must be JSON',
        hint: 'e.g. {"type": "sepa", "symbol": "MRVL.US"}',
      });
    }
    const error = exception instanceof Error ? exception : new Error(String(exception));
    console.error(error);
    return jsonResponse(500, { ok: false, error: error.message });
  }
}
