import { createKernel, type Kernel } from "../src/bootstrap.js";

let kernelPromise: Promise<Kernel> | undefined;

export async function tsukiRequest(path: string, init?: RequestInit): Promise<Response> {
  kernelPromise ??= createKernel();
  const { app } = await kernelPromise;
  return app.getInstance().request(path, init);
}
