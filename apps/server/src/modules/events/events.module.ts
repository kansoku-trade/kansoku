import { Module } from '@tsuki-hono/common';
import { EventsController } from './events.controller.js';

@Module({
  controllers: [EventsController],
})
export class EventsModule {}
