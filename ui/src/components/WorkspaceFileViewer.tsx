import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { workspaceFilesApi, type WorkspaceFileEntry } from "../api/workspaceFiles";

interface WorkspaceFileViewerProps {
  companyId: string;
  workspaceId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs",
  "ts", "tsx", "mts", "cts",
  "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp",
  "cs", "php", "sh", "bash", "zsh", "sql", "graphql",
  "html", "xml", "css", "scss", "sass", "json", "yaml", "yml", "toml",
  "vue", "svelte", "astro",
]);

function getFileIcon(name: string): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode className="h-4 w-4 shrink-0 text-blue-400" />;
  }
  if (["txt", "md", "mdx", "log", "csv"].includes(ext)) {
    return <FileText className="h-4 w-4 shrink-0 text-gray-400" />;
  }
  return <File className="h-4 w-4 shrink-0 text-gray-400" />;
}

// ─── File Tree Node ──────────────────────────────────────────────────────────

interface FileTreeNodeProps {
  companyId: string;
  workspaceId: string;
  entry: WorkspaceFileEntry;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (entry: WorkspaceFileEntry) => void;
}

function FileTreeNode({
  companyId,
  workspaceId,
  entry,
  depth,
  selectedPath,
  onSelectFile,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: children, isFetching } = useQuery({
    queryKey: ["workspace-files", companyId, workspaceId, entry.path],
    queryFn: () => workspaceFilesApi.listFiles(companyId, workspaceId, entry.path),
    enabled: entry.isDir && expanded,
    staleTime: 30_000,
  });

  const isSelected = !entry.isDir && selectedPath === entry.path;

  const handleClick = () => {
    if (entry.isDir) {
      setExpanded((prev) => !prev);
    } else {
      onSelectFile(entry);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={[
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm text-left transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/60 text-foreground/80",
        ].join(" ")}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {entry.isDir ? (
          <>
            <ChevronRight
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
            />
            {expanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-400" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            {getFileIcon(entry.name)}
          </>
        )}
        <span className="truncate">{entry.name}</span>
        {isFetching && <span className="ml-auto text-xs text-muted-foreground">…</span>}
      </button>

      {entry.isDir && expanded && children && (
        <div>
          {children.length === 0 && (
            <p
              className="py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
            >
              (empty)
            </p>
          )}
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              companyId={companyId}
              workspaceId={workspaceId}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

interface BreadcrumbsProps {
  filePath: string | null;
}

function Breadcrumbs({ filePath }: BreadcrumbsProps) {
  if (!filePath) return null;
  const parts = filePath.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground truncate">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className={i === parts.length - 1 ? "text-foreground font-medium" : ""}>{part}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function WorkspaceFileViewer({ companyId, workspaceId }: WorkspaceFileViewerProps) {
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileEntry | null>(null);

  // Root file listing
  const {
    data: rootFiles,
    isLoading: isLoadingRoot,
    isError: isRootError,
    error: rootError,
    refetch,
  } = useQuery({
    queryKey: ["workspace-files", companyId, workspaceId, ""],
    queryFn: () => workspaceFilesApi.listFiles(companyId, workspaceId),
    staleTime: 30_000,
  });

  // File content (lazy — only when a file is selected)
  const {
    data: fileContent,
    isLoading: isLoadingContent,
    isError: isContentError,
    error: contentError,
  } = useQuery({
    queryKey: ["workspace-file-content", companyId, workspaceId, selectedFile?.path],
    queryFn: () => workspaceFilesApi.getFileContent(companyId, workspaceId, selectedFile!.path),
    enabled: selectedFile != null && !selectedFile.isDir,
    staleTime: 60_000,
  });

  const handleSelectFile = (entry: WorkspaceFileEntry) => {
    setSelectedFile(entry);
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-md border border-border bg-background">
      {/* ── Left panel: file tree ── */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Files
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => refetch()}
          >
            ↺
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="py-1">
            {isLoadingRoot && (
              <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
            )}
            {isRootError && (
              <p className="px-3 py-4 text-xs text-destructive">
                {(rootError as Error)?.message ?? "Failed to load files"}
              </p>
            )}
            {!isLoadingRoot && !isRootError && rootFiles?.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">Workspace is empty</p>
            )}
            {rootFiles?.map((entry) => (
              <FileTreeNode
                key={entry.path}
                companyId={companyId}
                workspaceId={workspaceId}
                entry={entry}
                depth={0}
                selectedPath={selectedFile?.path ?? null}
                onSelectFile={handleSelectFile}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right panel: content preview ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedFile == null ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a file to preview
          </div>
        ) : (
          <>
            {/* File info bar */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <Breadcrumbs filePath={selectedFile.path} />
              <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span>{formatBytes(selectedFile.size)}</span>
                <span>Modified: {formatDate(selectedFile.mtime)}</span>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              {isLoadingContent && (
                <p className="px-4 py-6 text-xs text-muted-foreground">Loading content…</p>
              )}
              {isContentError && (
                <p className="px-4 py-6 text-xs text-destructive">
                  {(contentError as Error)?.message ?? "Failed to load file content"}
                </p>
              )}
              {!isLoadingContent && !isContentError && fileContent != null && (
                <pre
                  className="min-w-0 p-4 text-xs leading-relaxed font-mono text-foreground whitespace-pre overflow-x-auto"
                  style={{ tabSize: 2 }}
                >
                  {fileContent}
                </pre>
              )}
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
