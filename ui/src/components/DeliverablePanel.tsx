import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueWorkProduct, IssueWorkProductReviewState } from "@paperclipai/shared";
import { workProductsApi } from "@/api/workProducts";
import { queryKeys } from "@/lib/queryKeys";
import { cn, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  XCircle,
} from "lucide-react";

// ── Review-state badge ──────────────────────────────────────────────────────

const REVIEW_STATE_CONFIG: Record<
  IssueWorkProductReviewState,
  { label: string; className: string }
> = {
  none: {
    label: "Pending",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  needs_board_review: {
    label: "Pending Review",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  changes_requested: {
    label: "Changes Requested",
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

function ReviewStateBadge({ reviewState }: { reviewState: IssueWorkProductReviewState }) {
  const config = REVIEW_STATE_CONFIG[reviewState] ?? REVIEW_STATE_CONFIG.none;
  return (
    <Badge variant="outline" className={cn("text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}

// ── Health badge ────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<
  IssueWorkProduct["healthStatus"],
  { label: string; className: string }
> = {
  unknown: { label: "Unknown", className: "bg-gray-100 text-gray-500 border-gray-200" },
  healthy: { label: "Healthy", className: "bg-green-100 text-green-700 border-green-200" },
  unhealthy: { label: "Unhealthy", className: "bg-red-100 text-red-700 border-red-200" },
};

function HealthBadge({ healthStatus }: { healthStatus: IssueWorkProduct["healthStatus"] }) {
  const config = HEALTH_CONFIG[healthStatus] ?? HEALTH_CONFIG.unknown;
  return (
    <Badge variant="outline" className={cn("text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}

// ── Single work-product card ────────────────────────────────────────────────

function WorkProductCard({
  item,
  companyId,
  onUpdateReviewState,
  isPending,
}: {
  item: IssueWorkProduct;
  companyId: string;
  onUpdateReviewState: (id: string, reviewState: IssueWorkProductReviewState) => void;
  isPending: boolean;
}) {
  const reviewState = item.reviewState;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium text-sm truncate">{item.title}</span>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs capitalize">
          {item.type.replace(/_/g, " ")}
        </Badge>
        <Badge variant="outline" className="text-xs capitalize">
          {item.status.replace(/_/g, " ")}
        </Badge>
        <ReviewStateBadge reviewState={reviewState} />
        <HealthBadge healthStatus={item.healthStatus} />
      </div>

      {/* Created-at */}
      <p className="text-xs text-muted-foreground">
        Created {relativeTime(item.createdAt)}
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        {reviewState === "none" || reviewState === "changes_requested" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => onUpdateReviewState(item.id, "needs_board_review")}
          >
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Mark for Review
          </Button>
        ) : null}

        {reviewState === "needs_board_review" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50"
              disabled={isPending}
              onClick={() => onUpdateReviewState(item.id, "approved")}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              disabled={isPending}
              onClick={() => onUpdateReviewState(item.id, "changes_requested")}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

export interface DeliverablePanelProps {
  companyId: string;
  issueId: string;
}

export function DeliverablePanel({ companyId, issueId }: DeliverablePanelProps) {
  const queryClient = useQueryClient();

  const { data: workProducts, isLoading, isError } = useQuery({
    queryKey: queryKeys.issues.workProducts(issueId),
    queryFn: () => workProductsApi.listForIssue(companyId, issueId),
  });

  const updateReviewStateMutation = useMutation({
    mutationFn: ({
      workProductId,
      reviewState,
    }: {
      workProductId: string;
      reviewState: IssueWorkProductReviewState;
    }) => workProductsApi.updateReviewState(companyId, workProductId, reviewState),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.workProducts(issueId),
      });
    },
  });

  const handleUpdateReviewState = (
    workProductId: string,
    reviewState: IssueWorkProductReviewState,
  ) => {
    updateReviewStateMutation.mutate({ workProductId, reviewState });
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading deliverables…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        Failed to load deliverables.
      </div>
    );
  }

  if (!workProducts || workProducts.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
        <FileText className="h-8 w-8 opacity-40" />
        <p className="text-sm">No deliverables yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workProducts.map((item) => (
        <WorkProductCard
          key={item.id}
          item={item}
          companyId={companyId}
          onUpdateReviewState={handleUpdateReviewState}
          isPending={updateReviewStateMutation.isPending}
        />
      ))}
    </div>
  );
}
