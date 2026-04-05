// TODO: mount in app.ts: api.use(agentChatRoutes(db))
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentChatService } from "../services/agent-chat.js";
import { assertCompanyAccess, assertBoard } from "./authz.js";

export function agentChatRoutes(db: Db) {
  const router = Router();
  const svc = agentChatService(db);

  // GET /companies/:companyId/agents/:agentId/chat — list messages (query: issueId optional)
  router.get("/companies/:companyId/agents/:agentId/chat", async (req, res) => {
    const { companyId, agentId } = req.params as { companyId: string; agentId: string };
    assertCompanyAccess(req, companyId);
    const issueId = req.query.issueId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const messages = await svc.listMessages(agentId, issueId, limit);
    res.json(messages);
  });

  // POST /companies/:companyId/agents/:agentId/chat — send message (body: { content, role, issueId? })
  router.post("/companies/:companyId/agents/:agentId/chat", async (req, res) => {
    const { companyId, agentId } = req.params as { companyId: string; agentId: string };
    assertCompanyAccess(req, companyId);
    const { content, role, issueId } = req.body as {
      content: string;
      role: string;
      issueId?: string;
    };
    if (!content || !role) {
      res.status(400).json({ error: "content and role are required" });
      return;
    }
    const message = await svc.addMessage(companyId, agentId, role, content, issueId);
    res.status(201).json(message);
  });

  return router;
}
