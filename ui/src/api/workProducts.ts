import type { IssueWorkProduct, IssueWorkProductReviewState } from "@paperclipai/shared";
import { api } from "./client";

export const workProductsApi = {
  listForIssue: (companyId: string, issueId: string) =>
    api.get<IssueWorkProduct[]>(`/companies/${companyId}/issues/${issueId}/work-products`),

  updateReviewState: (
    companyId: string,
    workProductId: string,
    reviewState: IssueWorkProductReviewState,
  ) =>
    api.patch<IssueWorkProduct>(
      `/companies/${companyId}/work-products/${workProductId}/review-state`,
      { reviewState },
    ),
};
