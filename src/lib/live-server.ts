export interface LiveServerInfo {
  port: number;
  url: string;
  browserError: string | null;
  watchError: string | null;
}

export function liveControl(running: { port: number } | null) {
  if (running) {
    return {
      label: `Port: ${running.port}`,
      name: "Stop Live Server",
      running: true,
    };
  }
  return { label: "Go Live", name: "Start Live Server", running: false };
}

export function startedStatus(info: LiveServerInfo) {
  return {
    message: `Live Server started at ${info.url}`,
    error: [info.watchError, info.browserError].filter(Boolean).join(" "),
  };
}

export const LIVE_STOPPED = "Live Server stopped";

export function canOpenInBrowser(
  entry: { path: string; isDirectory: boolean } | null,
) {
  return !!entry && !entry.isDirectory && entry.path === "index.html";
}
