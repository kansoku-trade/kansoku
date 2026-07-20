export class NoCredentialsError extends Error {
  constructor() {
    super('longbridge credentials not configured');
    this.name = 'NoCredentialsError';
  }
}
