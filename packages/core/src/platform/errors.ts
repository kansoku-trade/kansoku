export class ClientError extends Error {
  hint: string | undefined;
  status: number;
  code: string | undefined;

  constructor(message: string, hint?: string, status = 400, code?: string) {
    super(message);
    this.name = 'ClientError';
    this.hint = hint;
    this.status = status;
    this.code = code;
  }
}
