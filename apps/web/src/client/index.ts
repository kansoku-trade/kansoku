import { allRoutes, type AppApi } from "@kansoku/core/contract/index";
import { createHttpClient } from "./http";
import { createIpcClient } from "./ipc";

export const client: AppApi = createIpcClient() ?? createHttpClient(allRoutes);
