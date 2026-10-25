# Live Server

## Goal

mIDE serves the open project folder over HTTP and opens it in the system browser. Saving a file reloads the open pages. The control is a status-bar button, in the spirit of the VS Code Live Server extension.

The server is for hand-written HTML, CSS, and JavaScript. It does not run Node, Vite, or a project command.

## Control

The button sits at the trailing end of the status bar, after the cursor position. It is absent until a folder is open.

The dot is 6px, the same size as the unsaved-file dot. Its colors are fixed and do not follow the editor theme: `#c44747` while stopped and `#2f9e57` while running.

| State | Dot | Visible label | Accessible name |
| --- | --- | --- | --- |
| Stopped | `#c44747` | Go Live | Start Live Server |
| Running | `#2f9e57` | Port: {port} | Stop Live Server |

The first click starts the server and opens `http://127.0.0.1:{port}/` in the system browser. The second click stops it. A click on Go Live, Stop, or Open in Browser during a start or stop that has not finished yet does nothing.

A dismissible status row, separate from the error strip, uses `role="status"`. It shows one message:

- `Live Server started at http://127.0.0.1:{port}`
- `Live Server stopped`

Dismiss clears it. A new status message replaces the previous one. Failures use the existing error strip and leave this row unchanged.

Focus Mode hides the status bar and leaves the server running. Switching projects or closing the window stops the server and drops its connections.

## Explorer

The context menu for the project-root file named `index.html` gains **Open in Browser** above the existing actions. Other files and folders do not show it.

When the server is stopped, the item starts it and opens the browser, the same result as Go Live. When the server is running, the item opens `http://127.0.0.1:{port}/` again and does not bind a new port.

## Server

Listen on `127.0.0.1` only. Try port 5500, then 5501, through 5509. The button shows the port that bound. If every port in that range is busy, do not start. The dot stays red and the error strip says `Live Server could not find a free port.`

`GET /` returns the root `index.html`. A directory with no `index.html` returns a plain HTML list of its child names, directories and files together, sorted by name. Each name is a link. A missing file returns status 404 and the text `Not found`. The server keeps running.

Other paths are files inside the project. Decode the URL path, ignore the query, and reject `..`, a backslash, or a symlink whose canonical target is outside the project. That is the same boundary the editor already uses.

Known types:

| Extension | Content-Type |
| --- | --- |
| `.html`, `.htm` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js`, `.mjs` | `text/javascript; charset=utf-8` |
| `.json` | `application/json` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.ico` | `image/x-icon` |
| `.txt` | `text/plain; charset=utf-8` |
| `.wasm` | `application/wasm` |

Any other file is `application/octet-stream`. Only `GET` is served. Any other method returns 405.

If the system browser cannot be opened, the server still runs. The dot stays green, the status row still shows the started message, and the error strip says `Could not open the browser. Open http://127.0.0.1:{port}`.

## Reload

HTML responses, including generated directory lists, include this script. Insert it immediately before the last `</body>`, compared case-insensitively. If there is no `</body>`, append it.

```html
<script>
(() => {
  const source = new EventSource("/__mide/live");
  source.onmessage = () => location.reload();
})();
</script>
```

`GET /__mide/live` is a Server-Sent Events stream, not a project file. It wins even if the project contains that path. Each reload is one SSE message whose data is `reload`. The page then reloads completely. CSS is not injected separately.

While the server runs, watch the project directory recursively. Ignore the initial scan. Coalesce create, modify, and remove events for 200ms into one `reload` message for every connected page. An unsaved editor change does not reload, because nothing has been written yet.

If watching cannot start, pages still load. The error strip says `Live Server cannot watch files for reload.` Stopping, switching projects, and closing the window still stop the server.

## Commands

Add `src-tauri/src/live_server.rs` and register it in both invoke-handler lists:

- `live_server_start` takes no path argument. It serves the workspace root already opened by the app and returns `{ port, url }`. With no project open it returns an error and does not listen.
- `live_server_stop` stops the server if it is running.
- `live_server_open` opens the current URL in the system browser and does not start or restart the server.

`live_server_open` fails with a clear error if the server is not running. The window `Destroyed` handler stops the server, as it already stops the terminal.

The browser is opened with the platform default (`xdg-open`, `open`, or the Windows shell association). No preview pane is added.

## Verification

Rust tests, without a browser:

- A path with `..`, a backslash, or a symlink target outside the project is rejected.
- `/` returns root `index.html` when that file exists.
- A directory without `index.html` returns a list containing its child names.
- A missing file is 404 with the text `Not found`.
- The reload script is inserted before `</body>` in HTML, appended when `</body>` is absent, and not inserted into CSS or JavaScript.
- Binding skips a busy port and stays inside 5500–5509.

Interface tests:

- The stopped button is “Go Live” with the red dot, and the running button is “Port: ” plus the port with the green dot.
- Start and stop set the status messages above.
- **Open in Browser** is present for root `index.html` and absent for every other entry.

Manual check: start, confirm the browser opens the project root, save a CSS file and see the page reload, stop and see the red dot, then switch projects and confirm the server has stopped.

## Documentation

Add a Live Server paragraph to the README Use section and one sentence to `DESIGN.md`: the status bar can start a local static server for the open folder and reload the system browser after a file is written.

## Out of scope

Project dev commands, Node, Vite, React or Astro tooling, an in-app preview panel, CSS injection without a reload, HTTPS, a configurable port, and opening any file other than the project root.
