export const FREE_CANVAS_LIMIT = 3;

export function canSaveCanvas(input: {
  licensed: boolean;
  replacing: boolean;
  count: number;
  limit?: number;
}): boolean {
  if (input.licensed || input.replacing) return true;
  return input.count < (input.limit ?? FREE_CANVAS_LIMIT);
}

export function canvasQuotaMessage(limit: number = FREE_CANVAS_LIMIT): string {
  return `免费版最多保存 ${limit} 张画布。覆盖已有画布不受限；升级 Pro 后不限数量。`;
}
