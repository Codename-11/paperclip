import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  ExternalLink,
  MessageSquareWarning,
  Package,
  RotateCcw,
} from "lucide-react";
import type { IssueWorkProduct, IssueWorkProductReviewState } from "@paperclipai/shared";

const REVIEW_STATE_CONFIG: Record<
  IssueWorkProductReviewState,
  { label: string; className: string }
> = {
  none: { label: "No Review", className: "bg-muted text-muted-foreground" },
  needs_board_review: {
    label: "Needs Review",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  },
  approved: {
    label: "Approved",
    className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  },
  changes_requested: {
    label: "Changes Requested",
    className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  },
};

function ReviewStateBadge({ state }: { state: IssueWorkProductReviewState }) {
  const config = REVIEW_STATE_CONFIG[state] ?? REVIEW_STATE_CONFIG.none;
  return (
    <Badge variant="outline" className={cn("text-[10px]", config.className)}>
      {config.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = type === "deliverable" ? "Deliverable" : type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant="secondary" className="text-[10px]">
      {label}
    </Badge>
  );
}

interface DeliverablesPanelProps {
  issueId: string;
}

export function DeliverablesPanel({ issueId }: DeliverablesPanelProps) {
  const queryClient = useQueryClient();

  const { data: workProducts, isLoading } = useQuery({
    queryKey: queryKeys.issues.workProducts(issueId),
    queryFn: () => issuesApi.listWorkProducts(issueId),
  });

  const updateWorkProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.updateWorkProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.workProducts(issueId) });
    },
  });

  const handleReview = (wp: IssueWorkProduct, newState: IssueWorkProductReviewState) => {
    updateWorkProduct.mutate({ id: wp.id, data: { reviewState: newState } });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }

  const items = workProducts ?? [];
  // Show deliverables first, then other work products
  const deliverables = items.filter((wp) => wp.type === "deliverable");
  const otherWorkProducts = items.filter((wp) => wp.type !== "deliverable");
  const sorted = [...deliverables, ...otherWorkProducts];

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Package className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No deliverables or work products yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((wp) => {
        const isDeliverable = wp.type === "deliverable";
        const needsReview = wp.reviewState === "needs_board_review";
        const isApproved = wp.reviewState === "approved";
        const isChangesRequested = wp.reviewState === "changes_requested";

        return (
          <div
            key={wp.id}
            className={cn(
              "rounded-lg border border-border p-3 transition-colors",
              isDeliverable && needsReview && "border-yellow-500/40 bg-yellow-500/5",
              isDeliverable && isApproved && "border-green-500/40 bg-green-500/5",
              isDeliverable && isChangesRequested && "border-red-500/40 bg-red-500/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{wp.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={wp.type} />
                  <ReviewStateBadge state={wp.reviewState} />
                  {wp.status !== "active" && (
                    <Badge variant="outline" className="text-[10px]">
                      {wp.status}
                    </Badge>
                  )}
                </div>
                {wp.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{wp.summary}</p>
                )}
              </div>
              {wp.url && (
                <a
                  href={wp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {/* Review actions for items that need review */}
            {(needsReview || isChangesRequested) && (
              <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-green-700 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
                  onClick={() => handleReview(wp, "approved")}
                  disabled={updateWorkProduct.isPending}
                >
                  <Check className="h-3 w-3" />
                  Approve
                </Button>
                {!isChangesRequested && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
                    onClick={() => handleReview(wp, "changes_requested")}
                    disabled={updateWorkProduct.isPending}
                  >
                    <MessageSquareWarning className="h-3 w-3" />
                    Request Changes
                  </Button>
                )}
              </div>
            )}
            {isApproved && (
              <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" /> Approved
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 gap-1 text-[10px] text-muted-foreground"
                  onClick={() => handleReview(wp, "needs_board_review")}
                  disabled={updateWorkProduct.isPending}
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-open review
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact summary for use on issue cards in the list view.
 * Shows deliverable count and review status indicator dots.
 */
export function DeliverablesSummary({ workProducts }: { workProducts: IssueWorkProduct[] }) {
  if (!workProducts || workProducts.length === 0) return null;

  const deliverables = workProducts.filter((wp) => wp.type === "deliverable");
  const total = workProducts.length;
  const needsReview = workProducts.filter((wp) => wp.reviewState === "needs_board_review").length;
  const approved = workProducts.filter((wp) => wp.reviewState === "approved").length;
  const changesRequested = workProducts.filter((wp) => wp.reviewState === "changes_requested").length;

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground" title={`${deliverables.length} deliverable(s), ${total} total work product(s)`}>
      <Package className="h-3 w-3" />
      <span>{total}</span>
      {needsReview > 0 && (
        <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" title={`${needsReview} needs review`} />
      )}
      {changesRequested > 0 && (
        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" title={`${changesRequested} changes requested`} />
      )}
      {approved > 0 && (
        <span className="inline-flex h-2 w-2 rounded-full bg-green-500" title={`${approved} approved`} />
      )}
    </span>
  );
}
