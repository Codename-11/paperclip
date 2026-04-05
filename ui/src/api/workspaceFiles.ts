import { api } from "./client";

export interface WorkspaceFileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  mtime: string; // ISO date string from JSON
}

export const workspaceFilesApi = {
  listFiles: (companyId: string, workspaceId: string, subpath?: string) => {
    const params = new URLSearchParams();
    if (subpath) params.set("subpath", subpath);
    const qs = params.toString();
    return api.get<WorkspaceFileEntry[]>(
      `/companies/${companyId}/execution-workspaces/${workspaceId}/files${qs ? `?${qs}` : ""}`,
    );
  },

  getFileContent: async (companyId: string, workspaceId: string, filePath: string): Promise<string> => {
    const params = new URLSearchParams({ path: filePath });
    const res = await fetch(
      `/api/companies/${companyId}/execution-workspaces/${workspaceId}/files/content?${params.toString()}`,
      { credentials: "include" },
    );
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      const message = (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
      throw new Error(message);
    }
    return res.text();
  },
};
