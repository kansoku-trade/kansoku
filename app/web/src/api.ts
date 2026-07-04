import type { ApiResult } from "../../shared/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = (await res.json()) as ApiResult<T>;
  if (!json.ok) throw new ApiError(json.hint ? `${json.error} (${json.hint})` : json.error, res.status);
  return json.data;
}
