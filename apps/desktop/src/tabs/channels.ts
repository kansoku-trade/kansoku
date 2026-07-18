export const TABS_COMMAND_CHANNEL = "desktop:tabs:command";
export const TABS_GET_CHANNEL = "desktop:tabs:get";
export const TABS_MUTATE_CHANNEL = "desktop:tabs:mutate";
export const TABS_SNAPSHOT_CHANNEL = "desktop:tabs:snapshot";

export type TabsCommand =
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "open-settings"
  | "open-logs"
  | "open-research"
  | "open-chat";
