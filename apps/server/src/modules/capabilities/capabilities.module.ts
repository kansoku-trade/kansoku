import { Module } from '@tsuki-hono/common';
import { CapabilitiesController } from './capabilities.controller.js';

@Module({
  controllers: [CapabilitiesController],
})
export class CapabilitiesModule {}
