import { Module } from '@tsuki-hono/common';
import { CanvasController } from './canvas.controller.js';

@Module({
  controllers: [CanvasController],
})
export class CanvasModule {}
