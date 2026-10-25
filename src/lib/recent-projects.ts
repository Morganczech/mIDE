import type { Project } from "./backend";
export const recentProjectsKey = "mide-recent-projects";
export const recentProjectsLimit = 10;
export function parseRecentProjects(raw: string | null): Project[] {
  if (!raw || raw.length > 64 * 1024) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const projects: Project[] = [];
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const { name, path } = value;
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 256 ||
        typeof path !== "string" ||
        path.length > 4096 ||
        !/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(path) ||
        /[\x00-\x1f]/.test(path)
      )
        continue;
      if (!projects.some((project) => project.path === path))
        projects.push({ name, path });
      if (projects.length === recentProjectsLimit) break;
    }
    return projects;
  } catch {
    return [];
  }
}
export function loadRecentProjects(): Project[] {
  try {
    return parseRecentProjects(localStorage.getItem(recentProjectsKey));
  } catch {
    return [];
  }
}
export function rememberProject(
  projects: Project[],
  project: Project,
): Project[] {
  return [
    project,
    ...projects.filter((item) => item.path !== project.path),
  ].slice(0, recentProjectsLimit);
}
export function storeRecentProjects(projects: Project[]) {
  try {
    localStorage.setItem(recentProjectsKey, JSON.stringify(projects));
  } catch {
    /* Opening a project must still work when local storage is unavailable. */
  }
}
