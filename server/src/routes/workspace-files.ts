// TODO: mount in app.ts: api.use(workspaceFileRoutes(db))

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { executionWorkspaces } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

const MAX_FILE_SIZE = 500 * 1024; // 500 KB

// Extensions considered text (non-exhaustive but broad)
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".mdx", ".csv", ".tsv", ".log", ".json", ".jsonl",
  ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
  ".js", ".jsx", ".mjs", ".cjs",
  ".ts", ".tsx", ".mts", ".cts",
  ".py", ".pyi", ".rb", ".go", ".rs", ".java", ".kt", ".kts",
  ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hxx",
  ".cs", ".fs", ".fsx", ".vb",
  ".sh", ".bash", ".zsh", ".fish", ".ps1",
  ".html", ".htm", ".xml", ".svg", ".css", ".scss", ".sass", ".less",
  ".sql", ".graphql", ".gql",
  ".dockerfile", ".makefile",
  ".gitignore", ".gitattributes", ".editorconfig",
  ".eslintrc", ".prettierrc", ".babelrc",
  ".lock", ".sum",
  ".r", ".R", ".jl", ".m", ".swift",
  ".php", ".pl", ".pm", ".lua", ".ex", ".exs", ".erl", ".hrl",
  ".clj", ".cljs", ".hs", ".elm", ".dart",
  ".vue", ".svelte", ".astro",
]);

function isBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  // If extension is in text list → not binary
  if (TEXT_EXTENSIONS.has(ext)) return false;
  // Files with no extension that are common text files
  const base = path.basename(filePath).toLowerCase();
  const knownTextBasenames = new Set([
    "dockerfile", "makefile", "rakefile", "gemfile", "procfile",
    "vagrantfile", "brewfile", "justfile", "caddyfile", "jenkinsfile",
    "readme", "license", "changelog", "authors", "notice", "contributing",
    ".gitignore", ".gitattributes", ".editorconfig", ".env",
    ".eslintrc", ".prettierrc", ".babelrc", ".npmrc", ".nvmrc",
  ]);
  if (knownTextBasenames.has(base)) return false;
  // If extension is present but not in text list, treat as binary
  if (ext) return true;
  // No extension, no known basename — treat as text (let null-byte check decide)
  return false;
}

/** Resolve workspace local path from DB row, same logic as execution-workspaces service */
function resolveWorkspacePath(cwd: string | null, providerRef: string | null): string | null {
  const raw = providerRef?.trim() || cwd?.trim() || null;
  return raw ?? null;
}

export function workspaceFileRoutes(db: Db) {
  const router = Router();

  // GET /companies/:companyId/execution-workspaces/:workspaceId/files
  router.get("/companies/:companyId/execution-workspaces/:workspaceId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const workspaceId = req.params.workspaceId as string;
    const subpath = (req.query.subpath as string | undefined) ?? "";

    // Fetch workspace from DB
    const row = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, workspaceId))
      .then((rows) => rows[0] ?? null);

    if (!row) {
      res.status(404).json({ error: "Execution workspace not found" });
      return;
    }
    if (row.companyId !== companyId) {
      res.status(403).json({ error: "Workspace does not belong to this company" });
      return;
    }

    const workspacePath = resolveWorkspacePath(row.cwd ?? null, row.providerRef ?? null);
    if (!workspacePath) {
      res.status(422).json({ error: "Workspace has no local path" });
      return;
    }

    // Sanitize subpath — prevent directory traversal
    const resolvedBase = path.resolve(workspacePath);
    const resolvedTarget = path.resolve(resolvedBase, subpath);
    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      res.status(400).json({ error: "Invalid subpath" });
      return;
    }

    // Read directory
    let names: string[];
    try {
      names = await fs.readdir(resolvedTarget);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        res.status(404).json({ error: "Directory not found" });
      } else if (code === "ENOTDIR") {
        res.status(400).json({ error: "Path is not a directory" });
      } else {
        res.status(500).json({ error: "Failed to read directory" });
      }
      return;
    }

    const result = await Promise.all(
      names.map(async (name) => {
        const entryPath = path.join(resolvedTarget, name);
        const relPath = path.relative(resolvedBase, entryPath);
        let size = 0;
        let mtime = new Date(0);
        let isDir = false;
        try {
          const stat = await fs.stat(entryPath);
          size = stat.size;
          mtime = stat.mtime;
          isDir = stat.isDirectory();
        } catch {
          // ignore stat errors for individual entries
        }
        return {
          name,
          path: relPath,
          size,
          isDir,
          mtime,
        };
      }),
    );

    // Sort: directories first, then alphabetically
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json(result);
  });

  // GET /companies/:companyId/execution-workspaces/:workspaceId/files/content
  router.get("/companies/:companyId/execution-workspaces/:workspaceId/files/content", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const workspaceId = req.params.workspaceId as string;
    const filePath = req.query.path as string | undefined;

    if (!filePath) {
      res.status(400).json({ error: "Missing required query param: path" });
      return;
    }

    // Fetch workspace from DB
    const row = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, workspaceId))
      .then((rows) => rows[0] ?? null);

    if (!row) {
      res.status(404).json({ error: "Execution workspace not found" });
      return;
    }
    if (row.companyId !== companyId) {
      res.status(403).json({ error: "Workspace does not belong to this company" });
      return;
    }

    const workspacePath = resolveWorkspacePath(row.cwd ?? null, row.providerRef ?? null);
    if (!workspacePath) {
      res.status(422).json({ error: "Workspace has no local path" });
      return;
    }

    // Sanitize path — prevent directory traversal
    const resolvedBase = path.resolve(workspacePath);
    const resolvedFile = path.resolve(resolvedBase, filePath);
    if (!resolvedFile.startsWith(resolvedBase + path.sep) && resolvedFile !== resolvedBase) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }

    // Reject known binary extensions early
    if (isBinaryExtension(resolvedFile)) {
      res.status(400).json({ error: "Binary files are not supported" });
      return;
    }

    // Stat the file
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(resolvedFile);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        res.status(404).json({ error: "File not found" });
      } else {
        res.status(500).json({ error: "Failed to stat file" });
      }
      return;
    }

    if (stat.isDirectory()) {
      res.status(400).json({ error: "Path is a directory, not a file" });
      return;
    }

    if (stat.size > MAX_FILE_SIZE) {
      res.status(400).json({ error: `File is too large (max ${MAX_FILE_SIZE / 1024}KB)` });
      return;
    }

    // Read file content
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(resolvedFile);
    } catch {
      res.status(500).json({ error: "Failed to read file" });
      return;
    }

    // Detect binary via null bytes in first 8KB
    const sampleSize = Math.min(buffer.length, 8192);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0) {
        res.status(400).json({ error: "Binary files are not supported" });
        return;
      }
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(buffer.toString("utf-8"));
  });

  return router;
}
