import { z } from "zod";

export const OpinionatedReviewsSchema = z.object({
  nodes: z.array(
    z
      .object({
        state: z.string(),
        author: z.object({ login: z.string() }).nullable().optional(),
      })
      .nullable(),
  ),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
});

export function reviewStatus(decision: unknown, reviews: unknown) {
  if (decision === "APPROVED") return "approved";
  if (decision === "CHANGES_REQUESTED") return "changes-requested";
  if (decision === "REVIEW_REQUIRED") return "review-required";
  // Repositories without required reviews can have approvals but no reviewDecision.
  const parsed = OpinionatedReviewsSchema.safeParse(reviews);
  if (!parsed.success) return null;
  if (parsed.data.nodes.some((review) => review?.state === "CHANGES_REQUESTED"))
    return "changes-requested";
  if (parsed.data.pageInfo.hasNextPage) return null;
  return parsed.data.nodes.some((review) => review?.state === "APPROVED") ? "approved" : null;
}

export function approvalLogins(
  reviews: z.output<typeof OpinionatedReviewsSchema>["nodes"],
): string[] {
  return [
    ...new Set(
      reviews.flatMap((review) =>
        review?.state === "APPROVED" && review.author != null ? [review.author.login] : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
