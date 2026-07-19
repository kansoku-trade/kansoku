export const RENDERER_CALL_REQUEST_CHANNEL = 'desktop:renderer-call:request';
export const RENDERER_CALL_RESPONSE_CHANNEL = 'desktop:renderer-call:response';

export interface RendererCallRequest {
  id: string;
  method: string;
  args: unknown;
}

export interface RendererCallResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
