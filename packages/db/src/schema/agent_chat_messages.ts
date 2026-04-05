// Schema for agent direct chat messages
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { companies } from './companies.js';
import { agents } from './agents.js';
import { issues } from './issues.js';

export const agentChatMessages = pgTable('agent_chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  issueId: uuid('issue_id').references(() => issues.id, { onDelete: 'set null' }),
  role: text('role').notNull(), // 'user' | 'agent'
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyAgentIdx: index('agent_chat_messages_company_agent_idx').on(table.companyId, table.agentId),
  companyIssueIdx: index('agent_chat_messages_company_issue_idx').on(table.companyId, table.issueId),
}));
