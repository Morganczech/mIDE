import { describe, expect, it } from "vitest";
import {
  parseRecentProjects,
  rememberProject,
  recentProjectsLimit,
} from "../src/lib/recent-projects";
describe("recent projects", () => {
  it("promotes reopened projects and updates names without duplicates", () => {
    const a = { name: "Old name", path: "/projects/a" },
      b = { name: "B", path: "/projects/b" };
    expect(rememberProject([b, a], { ...a, name: "A" })).toEqual([
      { name: "A", path: a.path },
      b,
    ]);
  });
  it("keeps ten newest projects", () => {
    let projects: { name: string; path: string }[] = [];
    for (let i = 0; i < 15; i++)
      projects = rememberProject(projects, {
        name: String(i),
        path: `/projects/${i}`,
      });
    expect(projects).toHaveLength(recentProjectsLimit);
    expect(projects[0].name).toBe("14");
    expect(projects.at(-1)!.name).toBe("5");
  });
  it("preserves Unicode, spaces, same-named folders and Windows paths", () => {
    const projects = [
      { name: "Projekt", path: "/one/Projekt" },
      { name: "Projekt", path: "/two/Projekt" },
      { name: "Žlutý projekt", path: "C:\\Users\\User\\Žlutý projekt" },
      { name: "Share", path: "\\\\server\\share" },
    ];
    expect(parseRecentProjects(JSON.stringify(projects))).toEqual(projects);
  });
  it("recovers from damaged storage and discards invalid records", () => {
    expect(parseRecentProjects("{bad")).toEqual([]);
    expect(parseRecentProjects("{}")).toEqual([]);
    expect(parseRecentProjects(null)).toEqual([]);
    expect(
      parseRecentProjects(
        JSON.stringify([
          null,
          { name: "Relative", path: "../relative" },
          { name: "Missing" },
          { name: "", path: "/empty" },
          { name: "Valid", path: "/valid" },
          { name: "Duplicate", path: "/valid" },
        ]),
      ),
    ).toEqual([{ name: "Valid", path: "/valid" }]);
  });
  it("bounds persisted history size", () => {
    expect(parseRecentProjects(" ".repeat(65537))).toEqual([]);
    expect(
      parseRecentProjects(
        JSON.stringify(
          Array.from({ length: 30 }, (_, i) => ({
            name: String(i),
            path: `/projects/${i}`,
          })),
        ),
      ),
    ).toHaveLength(10);
  });
});
