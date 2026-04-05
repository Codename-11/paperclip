import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentChatMessages } from "@paperclipai/db";

type AgentChatMessageRow = typeof agentChatMessages.$inferSelect;

export interface AgentChatMessage {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  role: string;
  content: string;
  createdAt: Date;
}

function toAgentChatMessage(row: AgentChatMessageRow): AgentChatMessage {
  return {
    id: row.id,
    companyId: row.companyId,
    agentId: row.agentId,
    issueId: row.issueId ?? null,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

export function agentChatService(db: Db) {
  return {
    listMessages: async (agentId: string, issueId?: string, limit = 50): Promise<AgentChatMessage[]> => {
      const conditions = [eq(agentChatMessages.agentId, agentId)];
      if (issueId) {
        conditions.push(eq(agentChatMessages.issueId, issueId));
      }
      const rows = await db
        .select()
        .from(agentChatMessages)
        .where(and(...conditions))
        .orderBy(asc(agentChatMessages.createdAt))
        .limit(limit);
      return rows.map(toAgentChatMessage);
    },

    addMessage: async (
      companyId: string,
      agentId: string,
      role: string,
      content: string,
      issueId?: string,
    ): Promise<AgentChatMessage> => {
      const row = await db
        .insert(agentChatMessages)
        .values({
          companyId,
          agentId,
          issueId: issueId ?? null,
          role,
          content,
        })
        .returning()
        .then((rows) => rows[0]);
      if (!row) throw new Error("Failed to insert agent chat message");
      return toAgentChatMessage(row);
    },
  };
}
