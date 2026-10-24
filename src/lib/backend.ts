import { invoke } from "@tauri-apps/api/core";
export interface Project {
  name: string;
  path: string;
}
export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
}
export interface FileData {
  text: string;
  revision: string;
  bom: boolean;
  lineEnding: "LF" | "CRLF";
}
export interface SystemFont {
  name: string;
  monospace: boolean;
}
export const backend = {
  fonts: () => invoke<SystemFont[]>("list_system_fonts"),
  terminalRunning: () => invoke<boolean>("terminal_running"),
  format: (path: string, text: string) =>
    invoke<string>("format_document", { path, text }),
  openProject: () => invoke<Project | null>("open_project"),
  list: (path: string) => invoke<Entry[]>("list_directory", { path }),
  read: (path: string) => invoke<FileData>("read_file", { path }),
  save: (path: string, text: string, revision: string, bom: boolean) =>
    invoke<string>("save_file", { path, text, revision, bom }),
  create: (path: string, directory: boolean) =>
    invoke<void>("create_entry", { path, directory }),
  rename: (path: string, destination: string) =>
    invoke<void>("rename_entry", { path, destination }),
  delete: (path: string) => invoke<void>("delete_entry", { path }),
};
export function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
}
export function parentPath(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
export function isWithin(path: string, directory: string) {
  return path === directory || path.startsWith(directory + "/");
}
export function validName(name: string) {
  return (
    !!name.trim() &&
    name !== "." &&
    name !== ".." &&
    !/[\\/\x00-\x1f]/.test(name)
  );
}
