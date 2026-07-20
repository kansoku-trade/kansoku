import type { HealthApi } from '../contract/health.js';
import { CHART_DATA_DIR, PORT } from '../platform/env.js';

export const healthService: HealthApi = {
  async get() {
    return { status: 'up', port: PORT, dataDir: CHART_DATA_DIR };
  },
};
