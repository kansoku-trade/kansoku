import { app } from 'electron';
import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator';

export interface AppProcessMetrics {
  cpuPercent: number;
  gpu: { cpuPercent: number; memoryMB: number } | null;
  rendererResidentMB: number | null;
}

export class DevtoolsIpc extends IpcService {
  static readonly groupName = 'devtools';

  // percentCPUUsage is measured since the previous getAppMetrics call, so every
  // reading must come from this single call; a second poller would corrupt both.
  @IpcMethod()
  getProcessMetrics(): AppProcessMetrics {
    const metrics = app.getAppMetrics();
    const gpu = metrics.filter((metric) => metric.type === 'GPU');
    const rendererPid = getIpcContext().sender.getOSProcessId();
    const renderer = metrics.find((metric) => metric.pid === rendererPid);
    return {
      cpuPercent: metrics.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0),
      gpu:
        gpu.length === 0
          ? null
          : {
              cpuPercent: gpu.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0),
              memoryMB: gpu.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024,
            },
      rendererResidentMB: renderer ? renderer.memory.workingSetSize / 1024 : null,
    };
  }
}
