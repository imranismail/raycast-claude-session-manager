import { readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface ClaudeSession {
  id: string;
  filePath: string;
  cwd: string;
  projectName: string;
  gitBranch: string | null;
  title: string | null;
  isWorktree: boolean;
  lastActiveAt: Date;
  mtimeMs: number;
}

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

function formatTitle(aiTitle: string): string {
  const spaced = aiTitle.replace(/[-_]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function parseSessionMeta(filePath: string): { cwd: string; gitBranch: string | null; title: string | null } | null {
  const lines = readFileSync(filePath, "utf-8").split("\n");

  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let title: string | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: { cwd?: unknown; gitBranch?: unknown; type?: unknown; aiTitle?: unknown };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (cwd === null && typeof parsed.cwd === "string") {
      cwd = parsed.cwd;
      gitBranch = typeof parsed.gitBranch === "string" ? parsed.gitBranch : null;
    }
    if (parsed.type === "ai-title" && typeof parsed.aiTitle === "string" && parsed.aiTitle.trim()) {
      title = formatTitle(parsed.aiTitle);
    }
  }

  return cwd === null ? null : { cwd, gitBranch, title };
}

export function listSessions(): ClaudeSession[] {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(PROJECTS_DIR);
  } catch {
    return [];
  }

  const sessions: ClaudeSession[] = [];

  for (const projectDir of projectDirs) {
    const projectPath = join(PROJECTS_DIR, projectDir);
    let sessionFiles: string[];
    try {
      sessionFiles = readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const sessionFile of sessionFiles) {
      const filePath = join(projectPath, sessionFile);
      try {
        const stat = statSync(filePath);
        if (stat.size === 0) continue;

        const parsed = parseSessionMeta(filePath);
        if (!parsed) continue;

        const cwd = parsed.cwd;
        const isWorktree = cwd.includes(".claude-worktrees");
        const projectName = cwd.split("/").filter(Boolean).pop() ?? cwd;

        sessions.push({
          id: sessionFile.replace(/\.jsonl$/, ""),
          filePath,
          cwd,
          projectName,
          gitBranch: parsed.gitBranch,
          title: parsed.title,
          isWorktree,
          lastActiveAt: stat.mtime,
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        continue;
      }
    }
  }

  return sessions.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}
