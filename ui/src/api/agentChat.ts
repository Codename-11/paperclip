import { api } from "./client";

export interface AgentChatMessage {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  role: string;
  content: string;
  createdAt: string;
}

export const agentChatApi = {
  listMessages: (companyId: string, agentId: string, issueId?: string) => {
    const params = new URLSearchParams();
    if (issueId) params.set("issueId", issueId);
    const qs = params.toString();
    return api.get<AgentChatMessage[]>(
      `/companies/${companyId}/agents/${agentId}/chat${qs ? `?${qs}` : ""}`,
    );
  },

  sendMessage: (
    companyId: string,
    agentId: string,
    content: string,
    role: string,
    issueId?: string,
  ) =>
    api.post<AgentChatMessage>(`/companies/${companyId}/agents/${agentId}/chat`, {
      content,
      role,
      ...(issueId ? { issueId } : {}),
    }),
};
