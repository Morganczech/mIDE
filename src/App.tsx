import { ProjectSearch } from "./components/ProjectSearch";
import { About } from "./components/About";
import {
  applyTheme,
  loadThemes,
  themeId,
  type CustomTheme,
} from "./lib/themes";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { EditorView } from "@codemirror/view";
import { Explorer, type FileAction } from "./components/Explorer";
import { Tabs } from "./components/Tabs";
import { Settings } from "./components/Settings";
import { normalizeFont, fontStack } from "./lib/appearance";
import { Editor } from "./components/Editor";
import {
  KeyboardShortcuts,
  focusShortcut,
  modifierKey,
} from "./components/KeyboardShortcuts";
import { Dialog, type DialogRequest } from "./components/Dialog";
import {
  backend,
  errorMessage,
  isWithin,
  parentPath,
  validName,
  type Entry,
  type Project,
  type ProjectMatch,
} from "./lib/backend";
import {
  openDocument,
  isDirty,
  documentText,
  type OpenDocument,
} from "./lib/documents";
import { isolateHistory } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { languageFor, prepareLanguage } from "./editor/languages";

const Terminal = lazy(() => import("./components/Terminal"));

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const documents = useRef<OpenDocument[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [, redraw] = useState(0);
  const changed = useCallback(() => redraw((n) => n + 1), []);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [customThemes, setCustomThemes] = useState(loadThemes);
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("mide-theme") ?? "dark";
    return stored === "light" ||
      customThemes.some((item) => themeId(item) === stored)
      ? stored
      : "dark";
  });
  const updateThemes = (themes: CustomTheme[]) => {
    localStorage.setItem("mide-custom-themes", JSON.stringify(themes));
    setCustomThemes(themes);
  };
  const [fontSize, setFontSize] = useState(() => {
    const stored = Number(localStorage.getItem("mide-font-size"));
    return Number.isFinite(stored) && stored >= 10 && stored <= 32
      ? stored
      : 14;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interfaceFont, setInterfaceFont] = useState(() =>
    normalizeFont(localStorage.getItem("mide-interface-font") ?? ""),
  );
  const [editorFont, setEditorFont] = useState(() =>
    normalizeFont(localStorage.getItem("mide-editor-font") ?? ""),
  );
  const [focus, setFocus] = useState(false);
  const [focusHint, setFocusHint] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalCreated, setTerminalCreated] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const view = useRef<EditorView | null>(null);
  const active = documents.current.find((doc) => doc.id === activeId);
  const currentActions = useRef({
    openFolder: async () => {},
    save: async () => {},
    close: async () => {},
    next: () => {},
    format: async () => {},
    toggleFocus: () => {},
    toggleTerminal: () => {},
  });
  const ask = (
    title: string,
    buttons: string[],
    message?: string,
    input?: string,
  ) =>
    new Promise<string | null>((resolve) =>
      setDialog({
        title,
        buttons,
        message,
        input,
        resolve: (answer) => {
          setDialog(null);
          resolve(answer);
          requestAnimationFrame(() => view.current?.focus());
        },
      }),
    );
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = async (doc: OpenDocument) => {
    const snapshot = doc.state.doc;
    const text = documentText(doc);
    const revision = await backend.save(doc.path, text, doc.revision, doc.bom);
    doc.revision = revision;
    doc.saved = snapshot;
    changed();
  };
  const mayClose = async (docs: OpenDocument[]) => {
    for (const doc of docs) {
      if (!isDirty(doc)) continue;
      const answer = await ask(
        "Save changes?",
        ["Save", "Discard", "Cancel"],
        doc.path,
      );
      if (answer === null) return false;
      if (answer === "Save") {
        await save(doc);
        if (isDirty(doc)) return false;
      }
    }
    return true;
  };
  const openFolder = () =>
    run(async () => {
      if (!(await mayClose(documents.current))) return;
      if (
        (await backend.terminalRunning()) &&
        (await ask(
          "Stop terminal?",
          ["Stop", "Cancel"],
          "Opening another project will stop the current shell and its processes.",
        )) !== "Stop"
      )
        return;
      const next = await backend.openProject();
      if (!next) return;
      documents.current = [];
      setTerminalCreated(false);
      setTerminalOpen(false);
      setActiveId(null);
      setProject(next);
      setVersion((v) => v + 1);
    });
  const openFile = (path: string, match?: ProjectMatch) =>
    run(async () => {
      let doc = documents.current.find((item) => item.path === path);
      if (!doc) {
        await prepareLanguage(path);
        doc = openDocument(path, await backend.read(path));
        documents.current.push(doc);
      }
      if (match) {
        const line = doc.state.doc.line(
          Math.min(match.line, doc.state.doc.lines),
        );
        const from = Math.min(line.to, line.from + match.column - 1);
        const to = Math.min(line.to, from + match.length);
        const selection = { anchor: from, head: to };
        if (activeId === doc.id && view.current)
          view.current.dispatch({
            selection,
            effects: EditorView.scrollIntoView(from, { y: "center" }),
          });
        else {
          doc.state = doc.state.update({ selection }).state;
          doc.scrollTop = Math.max(0, (match.line - 4) * fontSize * 1.65);
        }
      }
      setActiveId(doc.id);
      changed();
      if (match)
        requestAnimationFrame(() => {
          view.current?.focus();
          if (view.current)
            view.current.dispatch({
              effects: EditorView.scrollIntoView(
                view.current.state.selection.main.from,
                { y: "center" },
              ),
            });
        });
    });
  const closeTab = (id: number) =>
    run(async () => {
      const doc = documents.current.find((item) => item.id === id);
      if (!doc || !(await mayClose([doc]))) return;
      const index = documents.current.indexOf(doc);
      documents.current = documents.current.filter((item) => item.id !== id);
      if (activeId === id)
        setActiveId(
          documents.current[Math.min(index, documents.current.length - 1)]
            ?.id ?? null,
        );
      changed();
    });
  const fileAction = (action: FileAction, entry: Entry | null) =>
    run(async () => {
      if (action === "refresh") {
        setVersion((v) => v + 1);
        return;
      }
      if (action === "file" || action === "folder") {
        const name = await ask(
          action === "file" ? "New file" : "New folder",
          ["Create", "Cancel"],
          undefined,
          "",
        );
        if (name === null) return;
        if (!validName(name))
          throw new Error("Enter a name without path separators.");
        const parent = entry?.isDirectory
          ? entry.path
          : parentPath(entry?.path ?? "");
        const path = parent ? `${parent}/${name}` : name;
        await backend.create(path, action === "folder");
        setVersion((v) => v + 1);
        if (action === "file") {
          const doc = openDocument(path, await backend.read(path));
          documents.current.push(doc);
          setActiveId(doc.id);
        }
      } else if (entry) {
        const affected = documents.current.filter((doc) =>
          isWithin(doc.path, entry.path),
        );
        if (action === "rename") {
          const name = await ask(
            "Rename",
            ["Rename", "Cancel"],
            undefined,
            entry.name,
          );
          if (name === null || name === entry.name) return;
          if (!validName(name))
            throw new Error("Enter a name without path separators.");
          const parent = parentPath(entry.path);
          const destination = parent ? `${parent}/${name}` : name;
          await backend.rename(entry.path, destination);
          for (const doc of affected) {
            doc.path = destination + doc.path.slice(entry.path.length);
            await prepareLanguage(doc.path);
            const effects = doc.language.reconfigure(languageFor(doc.path));
            if (activeId === doc.id && view.current)
              view.current.dispatch({ effects });
            else doc.state = doc.state.update({ effects }).state;
          }
        } else {
          const answer = await ask(
            "Delete permanently?",
            ["Delete", "Cancel"],
            `${entry.path}${entry.isDirectory ? " and its contents" : ""}. This cannot be undone.`,
          );
          if (answer !== "Delete" || !(await mayClose(affected))) return;
          await backend.delete(entry.path);
          documents.current = documents.current.filter(
            (doc) => !affected.includes(doc),
          );
          if (affected.some((doc) => doc.id === activeId))
            setActiveId(documents.current[0]?.id ?? null);
        }
        setVersion((v) => v + 1);
      }
      changed();
    });
  const format = () =>
    run(async () => {
      if (!active) return;
      const snapshot = active.state.doc;
      const result = await backend.format(active.path, documentText(active));
      if (!active.state.doc.eq(snapshot))
        throw new Error(
          "Document changed during formatting. Run Format Document again.",
        );
      const change = {
        changes: { from: 0, to: active.state.doc.length, insert: result },
        userEvent: "input.format",
        annotations: isolateHistory.of("full"),
      };
      if (view.current && activeId === active.id) view.current.dispatch(change);
      else active.state = active.state.update(change).state;
      changed();
    });
  useLayoutEffect(() => {
    applyTheme(theme, customThemes);
    localStorage.setItem("mide-theme", theme);
  }, [theme, customThemes]);
  useEffect(() => {
    requestAnimationFrame(() => {
      view.current?.requestMeasure();
      view.current?.focus();
    });
  }, [focus]);
  useEffect(() => {
    setFocusHint(focus);
    if (!focus) return;
    const timer = window.setTimeout(() => setFocusHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, [focus]);
  const closeSettings = () => {
    setSettingsOpen(false);
    requestAnimationFrame(() => {
      view.current?.requestMeasure();
      view.current?.focus();
    });
  };
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--font-ui",
      fontStack(interfaceFont, "interface"),
    );
    document.documentElement.style.setProperty(
      "--font-code",
      fontStack(editorFont, "editor"),
    );
    localStorage.setItem("mide-interface-font", interfaceFont);
    localStorage.setItem("mide-editor-font", editorFont);
  }, [interfaceFont, editorFont]);
  const closeShortcuts = () => {
    setShortcutsOpen(false);
    requestAnimationFrame(() => {
      if (settingsOpen) document.getElementById("settings-heading")?.focus();
      else view.current?.focus();
    });
  };
  const closeAbout = () => {
    setAboutOpen(false);
    requestAnimationFrame(() => {
      if (settingsOpen) document.getElementById("settings-heading")?.focus();
      else if (view.current) view.current.focus();
      else
        document
          .querySelector<HTMLButtonElement>(".empty-state button")
          ?.focus();
    });
  };
  useLayoutEffect(() => {
    localStorage.setItem("mide-font-size", String(fontSize));
  }, [fontSize]);
  currentActions.current = {
    openFolder,
    format,
    toggleTerminal: () => {
      if (project) {
        setTerminalCreated(true);
        setTerminalOpen((value) => !value);
      }
    },
    toggleFocus: () => setFocus((value) => !value),
    save: () =>
      run(async () => {
        if (active) await save(active);
      }),
    close: () => (active ? closeTab(active.id) : Promise.resolve()),
    next: () => {
      const docs = documents.current;
      if (docs.length)
        setActiveId(
          docs[(docs.findIndex((doc) => doc.id === activeId) + 1) % docs.length]
            .id,
        );
    },
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || dialog || aboutOpen || projectSearchOpen) return;
      if (event.key === "F1") {
        event.preventDefault();
        event.stopPropagation();
        setMenu(false);
        setShortcutsOpen(true);
        return;
      }
      if (shortcutsOpen) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        !event.getModifierState("AltGraph") &&
        (event.code === "KeyF" || event.key.toLowerCase() === "f") &&
        !event.shiftKey &&
        project &&
        !settingsOpen
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMenu(false);
        setProjectSearchOpen(true);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key === ","
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMenu(false);
        setSettingsOpen(true);
        return;
      }
      if (settingsOpen && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSettings();
        return;
      }

      if (
        event.key === "Escape" &&
        focus &&
        !menu &&
        !document.querySelector(".find-panel")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setFocus(false);
        return;
      }

      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        dialog ||
        event.isComposing
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "+" || key === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        event.stopPropagation();
        setFontSize((size) => Math.min(32, size + 1));
        return;
      }
      if (key === "-" || key === "_" || event.code === "NumpadSubtract") {
        event.preventDefault();
        event.stopPropagation();
        setFontSize((size) => Math.max(10, size - 1));
        return;
      }
      if (key === "0" || event.code === "Digit0" || event.code === "Numpad0") {
        event.preventDefault();
        event.stopPropagation();
        setFontSize(14);
        return;
      }

      if (settingsOpen) {
        if (["s", "w", "o", "tab", "j", "f", "enter"].includes(key)) {
          event.preventDefault();
          if (key === "w") closeSettings();
        }
        return;
      }
      if (key === "j") {
        event.preventDefault();
        currentActions.current.toggleTerminal();
        return;
      }
      if (key === "enter" && event.shiftKey) {
        event.preventDefault();
        currentActions.current.toggleFocus();
        return;
      }
      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        void currentActions.current.format();
        return;
      }
      if (key === "o" || key === "s" || key === "w" || key === "tab") {
        event.preventDefault();
        if (busyRef.current) return;
        const actions = currentActions.current;
        if (key === "o") void actions.openFolder();
        else if (key === "s") void actions.save();
        else if (key === "w") void actions.close();
        else actions.next();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [
    dialog,
    focus,
    menu,
    shortcutsOpen,
    settingsOpen,
    aboutOpen,
    projectSearchOpen,
    project,
  ]);
  const closeRequest = useRef(async () => {});
  closeRequest.current = () =>
    run(async () => {
      if (await mayClose(documents.current)) await getCurrentWindow().destroy();
    });
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        void closeRequest.current();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (isTauri())
      void getCurrentWindow().setTitle(
        `${active ? `${isDirty(active) ? "• " : ""}${active.path} — ` : ""}${project ? `${project.name} — ` : ""}mIDE`,
      );
  });
  const position = active
    ? active.state.doc.lineAt(active.state.selection.main.head)
    : null;
  return (
    <div
      className={`app ${project ? "has-project" : ""} ${focus ? "focus-mode" : ""} ${settingsOpen ? "settings-open" : ""}`}
      aria-busy={busy}
    >
      {project && (
        <Explorer
          key={project.path}
          name={project.name}
          version={version}
          activePath={active?.path}
          open={openFile}
          action={fileAction}
          error={setError}
        />
      )}
      <main>
        {settingsOpen && (
          <Settings
            theme={theme}
            setTheme={setTheme}
            customThemes={customThemes}
            updateThemes={updateThemes}
            interfaceFont={interfaceFont}
            setInterfaceFont={setInterfaceFont}
            editorFont={editorFont}
            setEditorFont={setEditorFont}
            fontSize={fontSize}
            setFontSize={setFontSize}
            close={closeSettings}
          />
        )}

        {project && (
          <div className="workspace-menu">
            <button
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              Menu
            </button>
            {menu && (
              <>
                <div className="menu-dismiss" onClick={() => setMenu(false)} />
                <div
                  className="context-menu"
                  role="menu"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setMenu(false);
                      view.current?.focus();
                    }
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const items = [
                        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "button:not(:disabled)",
                        ),
                      ];
                      const index = items.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      items[
                        (index +
                          (event.key === "ArrowDown" ? 1 : items.length - 1)) %
                          items.length
                      ]?.focus();
                    }
                  }}
                >
                  <button
                    autoFocus
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      void openFolder();
                    }}
                  >
                    <span>Open Folder</span>
                    <kbd>{modifierKey} + O</kbd>
                  </button>
                  <button
                    role="menuitem"
                    disabled={!active}
                    onClick={() => {
                      setMenu(false);
                      void currentActions.current.save();
                    }}
                  >
                    <span>Save</span>
                    <kbd>{modifierKey} + S</kbd>
                  </button>
                  <button
                    role="menuitem"
                    disabled={!active}
                    onClick={() => {
                      setMenu(false);
                      if (view.current) openSearchPanel(view.current);
                    }}
                  >
                    <span>Find</span>
                    <kbd>{modifierKey} + F</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setProjectSearchOpen(true);
                    }}
                  >
                    <span>Find in Project</span>
                    <kbd>{modifierKey} + Alt + F</kbd>
                  </button>
                  <button
                    role="menuitem"
                    disabled={!active}
                    onClick={() => {
                      setMenu(false);
                      void format();
                    }}
                  >
                    <span>Format Document</span>
                    <kbd>{modifierKey} + Shift + F</kbd>
                  </button>
                  <button
                    role="menuitem"
                    disabled={!project}
                    onClick={() => {
                      setMenu(false);
                      currentActions.current.toggleTerminal();
                    }}
                  >
                    <span>Toggle Terminal</span>
                    <kbd>{modifierKey} + J</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setTheme((value) =>
                        value === "dark" ? "light" : "dark",
                      );
                    }}
                  >
                    {theme === "dark" ? "Light Theme" : "Dark Theme"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setFocus(true);
                    }}
                  >
                    <span>Focus Mode</span>
                    <kbd>{modifierKey} + Shift + Enter</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <span>Settings</span>
                    <kbd>{modifierKey} + ,</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setShortcutsOpen(true);
                    }}
                  >
                    {" "}
                    <span>Keyboard Shortcuts</span>
                    <kbd>F1</kbd>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setAboutOpen(true);
                    }}
                  >
                    About mIDE
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {project && (
          <Tabs
            documents={documents.current}
            active={activeId}
            select={(id) => {
              if (!busyRef.current) setActiveId(id);
            }}
            close={closeTab}
          />
        )}
        {error && (
          <div className="error-strip" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {active ? (
          <Editor
            document={active}
            fontSize={fontSize}
            fontFamily={editorFont}
            viewRef={view}
            changed={changed}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-actions">
              <button disabled={busy} onClick={() => void openFolder()}>
                Open Folder
                <span className="shortcut">
                  {navigator.platform.includes("Mac") ? "⌘ O" : "Ctrl O"}
                </span>
              </button>
              <button
                className="settings-link"
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
              <button
                className="settings-link"
                onClick={() => setAboutOpen(true)}
              >
                About mIDE
              </button>
            </div>
          </div>
        )}
        {terminalCreated && project && (
          <Suspense fallback={null}>
            <Terminal
              key={project.path}
              visible={terminalOpen && !focus && !settingsOpen}
              theme={theme + JSON.stringify(customThemes)}
              fontFamily={fontStack(editorFont, "editor")}
              hide={() => {
                setTerminalOpen(false);
                view.current?.focus();
              }}
            />
          </Suspense>
        )}
      </main>
      {project && (
        <footer className="status">
          <span className="status-path">{active?.path ?? project.name}</span>
          {active && (
            <>
              <span>{active.lineEnding}</span>
              <span>UTF-8{active.bom ? " BOM" : ""}</span>
              <span>
                Ln {position!.number}, Col{" "}
                {active.state.selection.main.head - position!.from + 1}
              </span>
            </>
          )}
        </footer>
      )}
      {focus && focusHint && (
        <div className="focus-hint" role="status">
          <span>Focus Mode · {focusShortcut} or Esc to exit</span>
          <button onClick={() => setFocus(false)}>Exit Focus Mode</button>
        </div>
      )}
      {shortcutsOpen && <KeyboardShortcuts close={closeShortcuts} />}
      {aboutOpen && <About close={closeAbout} />}
      {projectSearchOpen && project && (
        <ProjectSearch
          buffers={() =>
            documents.current.map((doc) => ({
              path: doc.path,
              text: documentText(doc),
            }))
          }
          select={(match) => {
            setProjectSearchOpen(false);
            void openFile(match.path, match);
          }}
          close={() => {
            setProjectSearchOpen(false);
            requestAnimationFrame(() => view.current?.focus());
          }}
        />
      )}

      {dialog && (
        <Dialog
          key={dialog.title + dialog.message + dialog.input}
          request={dialog}
        />
      )}
    </div>
  );
}
