import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { archiveFileUrl } from "./gdeltArchiveWindow.js";

const execFileAsync = promisify(execFile);

export type FetchArchiveFile = (stamp: string) => Promise<Buffer | null>;
export type ReadArchiveCsv = (zipPath: string) => Promise<string>;

export const fetchArchiveFileLive: FetchArchiveFile = async (stamp) => {
  const response = await fetch(archiveFileUrl(stamp));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`gdelt archive fetch failed for ${stamp}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

export const readArchiveCsvLive: ReadArchiveCsv = async (zipPath) => {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  });
  return stdout;
};
