import 'reflect-metadata';
import type { Constructor } from '@tsuki-hono/common';

export class ServerBuilder {
  private extra: Constructor[] = [];
  private includePublic = false;

  constructor(private readonly publicModules: Constructor[]) {}

  addPublicModules(): void {
    this.includePublic = true;
  }

  addModule(mod: Constructor): void {
    this.extra.push(mod);
  }

  build(): Constructor[] {
    return [...(this.includePublic ? this.publicModules : []), ...this.extra];
  }
}
