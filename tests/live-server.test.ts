import { describe, expect, it } from "vitest";
import { LIVE_STOPPED, liveControl, startedStatus, type LiveServerInfo } from "../src/lib/live-server";

const running: LiveServerInfo = {
  port: 5500,
  url: "http://127.0.0.1:5500/",
  browserError: null,
  watchError: null,
};

describe("live server control", () => {
  it("labels the stopped and running button", () => {
    expect(liveControl(null)).toEqual({
      label: "Go Live",
      name: "Start Live Server",
      running: false,
    });
    expect(liveControl({ port: 5502 })).toEqual({
      label: "Port: 5502",
      name: "Stop Live Server",
      running: true,
    });
  });

  it("sets the started message and keeps server failures beside it", () => {
    expect(startedStatus(running)).toEqual({
      message: "Live Server started at http://127.0.0.1:5500/",
      error: "",
    });
    expect(
      startedStatus({
        ...running,
        browserError: "Could not open the browser. Open http://127.0.0.1:5500/",
        watchError: "Live Server cannot watch files for reload.",
      }).error,
    ).toBe(
      "Live Server cannot watch files for reload. Could not open the browser. Open http://127.0.0.1:5500/",
    );
  });

  it("uses the stopped sentence", () => {
    expect(LIVE_STOPPED).toBe("Live Server stopped");
  });
});
