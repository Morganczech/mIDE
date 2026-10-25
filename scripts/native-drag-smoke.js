(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const events = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, label) => {
    for (let i = 0; i < 400; i++) {
      if (await predicate()) return;
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const row = (path) =>
    [...document.querySelectorAll("[data-path]")].find(
      (row) => row.dataset.path === path,
    );
  const center = (element) => {
    const r = element.getBoundingClientRect();
    return { x: r.x + Math.min(90, r.width / 2), y: r.y + r.height / 2 };
  };
  for (const type of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mousemove",
    "mouseup",
    "dragstart",
    "gotpointercapture",
    "lostpointercapture",
  ]) {
    document.addEventListener(
      type,
      (event) => {
        events.push({
          type,
          x: event.clientX,
          y: event.clientY,
          target: event.target.closest?.("[data-path]")?.dataset.path,
          buttons: event.buttons,
        });
      },
      true,
    );
  }
  try {
    await until(
      () => document.querySelector(".empty-state button"),
      "empty state",
    );
    document.querySelector(".empty-state button").click();
    await until(
      () => row("drag.txt") && row("destination") && row("folder"),
      "tree",
    );
    await wait(800);
    await invoke("smoke_report", {
      success: true,
      report: JSON.stringify({
        phase: "file",
        from: center(row("drag.txt")),
        to: center(row("destination")),
        pixelRatio: devicePixelRatio,
        screenX,
        screenY,
        outerWidth,
        innerWidth,
        outerHeight,
        innerHeight,
      }),
    });
    await until(
      async () =>
        (await invoke("list_directory", { path: "destination" })).some(
          (entry) => entry.path === "destination/drag.txt",
        ),
      "file pointer move",
    );
    await until(() => row("folder"), "folder tree");
    await invoke("smoke_report", {
      success: true,
      report: JSON.stringify({
        phase: "folder",
        from: center(row("folder")),
        to: center(row("destination")),
        pixelRatio: devicePixelRatio,
        screenX,
        screenY,
        outerWidth,
        innerWidth,
        outerHeight,
        innerHeight,
      }),
    });
    await until(
      async () =>
        (await invoke("list_directory", { path: "destination" })).some(
          (entry) => entry.path === "destination/folder",
        ),
      "folder pointer move",
    );
    await invoke("smoke_report", {
      success: true,
      report: JSON.stringify({ phase: "done", events }),
    });
  } catch (error) {
    await invoke("smoke_report", {
      success: false,
      report: JSON.stringify({
        phase: "failed",
        message: error.message,
        events,
      }),
    });
  }
  await invoke("plugin:window|destroy", { label: "main" });
})();
