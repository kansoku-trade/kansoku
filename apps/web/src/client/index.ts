import { allRoutes, type AppApi } from "../../../../packages/core/src/contract/index.js";
import { createHttpClient } from "./http";
import { createIpcClient } from "./ipc";

export const client: AppApi = createIpcClient() ?? createHttpClient(allRoutes);
