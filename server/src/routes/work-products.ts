// TODO: mount in app.ts: api.use(workProductRoutes(db))
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { issueWorkProductReviewStateSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { workProductService } from "../services/work-products.js";
import { assertCompanyAccess } from "./authz.js";

const updateReviewStateSchema = z.object({
  reviewState: issueWorkProductReviewStateSchema,
});

export function workProductRoutes(db: Db) {
  const router = Router();
  const svc = workProductService(db);

  // GET /companies/:companyId/issues/:issueId/work-products
  router.get("/companies/:companyId/issues/:issueId/work-products", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const issueId = req.params.issueId as string;
    const workProducts = await svc.listForIssue(issueId);
    res.json(workProducts);
  });

  // PATCH /companies/:companyId/work-products/:id/review-state
  router.patch(
    "/companies/:companyId/work-products/:id/review-state",
    validate(updateReviewStateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const id = req.params.id as string;

      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Work product not found" });
        return;
      }
      if (existing.companyId !== companyId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const updated = await svc.update(id, { reviewState: req.body.reviewState });
      if (!updated) {
        res.status(404).json({ error: "Work product not found" });
        return;
      }
      res.json(updated);
    },
  );

  return router;
}
