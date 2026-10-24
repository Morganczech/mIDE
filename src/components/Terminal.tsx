import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal as Xterm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { errorMessage } from "../lib/backend";

let lifecycle: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = lifecycle.then(action, action);
  lifecycle = next.catch(() => {});
  return next;
}
function colors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string) => css.getPropertyValue(name).trim();
  const light = document.documentElement.dataset.theme === "light";
  return {
    background: get("--bg"),
    foreground: get("--fg"),
    cursor: get("--cursor"),
    selectionBackground: get("--selection"),
    black: light ? "#353535" : "#252525",
    red: light ? "#9f3636" : "#d49393",
    green: light ? "#486a32" : "#adc496",
    yellow: light ? "#79601d" : "#cebd8c",
    blue: light ? "#355e8c" : "#9bb8d2",
    magenta: light ? "#79528e" : "#bea4ce",
    cyan: light ? "#296d72" : "#96c1c5",
    white: light ? "#deded8" : "#d8d8d2",
    brightBlack: light ? "#656565" : "#8e8e8e",
    brightRed: light ? "#a83c3c" : "#e0abab",
    brightGreen: light ? "#4c7432" : "#bfd2ac",
    brightYellow: light ? "#7b641f" : "#ded0a3",
    brightBlue: light ? "#3b6492" : "#b1cae1",
    brightMagenta: light ? "#815895" : "#d0bcde",
    brightCyan: light ? "#2c7478" : "#acd4d8",
    brightWhite: light ? "#f9f9f4" : "#f0f0e9",
  };
}
type Output =
  | { type: "data"; data: number[] }
  | { type: "exit" }
  | { type: "error"; data: string };
export default function Terminal({
  visible,
  theme,
  fontFamily,
  hide,
}: {
  visible: boolean;
  theme: string;
  fontFamily: string;
  hide: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [height, setHeight] = useState(240);
  const [maxHeight, setMaxHeight] = useState(
    Math.max(120, window.innerHeight - 200),
  );
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [exited, setExited] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const parent = panel.current!.parentElement!;
    const observer = new ResizeObserver(() => {
      const chromeHeight = [...parent.children]
        .filter(
          (child) =>
            child !== panel.current &&
            !child.matches(".editor-host, .empty-state"),
        )
        .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
      const limit = Math.max(
        120,
        Math.floor(parent.clientHeight - chromeHeight - 100),
      );
      setMaxHeight(limit);
      setHeight((current) => Math.min(current, limit));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible) drag.current = null;
  }, [visible]);
  const resizeTo = (value: number) =>
    setHeight(Math.max(120, Math.min(maxHeight, value)));
  useEffect(() => {
    let disposed = false;
    const term = new Xterm({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue(
        "--font-code",
      ),
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 2000,
      cursorBlink: false,
      theme: colors(),
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current!);
    termRef.current = term;
    fitRef.current = fit;
    if (host.current!.clientWidth && host.current!.clientHeight) fit.fit();
    const channel = new Channel<Output>();
    let pending: Promise<number>;
    const report = (e: unknown) => {
      if (!disposed) setError(errorMessage(e));
    };
    channel.onmessage = (message) => {
      if (disposed) return;
      if (message.type === "data")
        term.write(new Uint8Array(message.data), () => {
          void pending
            .then((id) =>
              invoke("terminal_ack", { id, bytes: message.data.length }),
            )
            .catch(report);
        });
      else if (message.type === "exit") setExited(true);
      else setError(message.data);
    };
    pending = serialize(() =>
      invoke<number>("terminal_start", {
        output: channel,
        cols: term.cols,
        rows: term.rows,
      }),
    );
    void pending
      .then((id) => {
        if (!disposed) {
          sessionRef.current = id;
          if (import.meta.env.VITE_NATIVE_SMOKE === "1") {
            (
              window as unknown as {
                __mideTerminal: Xterm;
                __mideTerminalId: number;
              }
            ).__mideTerminal = term;
            (
              window as unknown as { __mideTerminalId: number }
            ).__mideTerminalId = id;
          }
          term.focus();
        }
      })
      .catch(report);
    let inputQueue = Promise.resolve();
    const input = term.onData((data) => {
      inputQueue = inputQueue
        .then(() => pending)
        .then((id) => invoke<void>("terminal_write", { id, data }))
        .catch(report);
    });
    const resize = term.onResize(({ cols, rows }) => {
      void pending
        .then((id) => invoke("terminal_resize", { id, cols, rows }))
        .catch(report);
    });
    const observer = new ResizeObserver(() => {
      if (host.current?.clientWidth && host.current?.clientHeight) fit.fit();
    });
    observer.observe(host.current!);
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      sessionRef.current = null;
      void serialize(async () => {
        const id = await pending;
        await invoke("terminal_stop", { id });
      }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontFamily = fontFamily;
      if (visible) requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [fontFamily]);
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = colors();
  }, [theme]);
  useEffect(() => {
    if (visible)
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
  }, [visible]);
  return (
    <section
      ref={panel}
      className="terminal-panel"
      style={{ display: visible ? undefined : "none", height, maxHeight }}
      aria-label="Terminal"
    >
      <div
        className="terminal-resizer"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        aria-controls="terminal-content"
        aria-valuemin={120}
        aria-valuemax={maxHeight}
        aria-valuenow={height}
        aria-valuetext={`${Math.round(height)} pixels high`}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: panel.current!.getBoundingClientRect().height,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          event.preventDefault();
          resizeTo(current.startHeight + current.startY - event.clientY);
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          termRef.current?.focus();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            resizeTo(height + (event.key === "ArrowUp" ? 20 : -20));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            resizeTo(event.key === "Home" ? 120 : maxHeight);
          }
        }}
      />
      <header>
        <span>Terminal{exited ? " — shell exited" : ""}</span>
        <button aria-label="Hide terminal" onClick={hide}>
          Hide
        </button>
      </header>
      {error && (
        <div className="terminal-error" role="alert">
          {error}
        </div>
      )}
      <div id="terminal-content" className="terminal-host" ref={host} />
    </section>
  );
}
