CREATE TABLE IF NOT EXISTS "agent_chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "agent_chat_messages_company_agent_idx" ON "agent_chat_messages" ("company_id", "agent_id");
CREATE INDEX IF NOT EXISTS "agent_chat_messages_company_issue_idx" ON "agent_chat_messages" ("company_id", "issue_id");
