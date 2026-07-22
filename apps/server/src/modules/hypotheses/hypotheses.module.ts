import { Module } from '@tsuki-hono/common';
import { HypothesesController } from './hypotheses.controller.js';

@Module({
  controllers: [HypothesesController],
})
export class HypothesesModule {}
