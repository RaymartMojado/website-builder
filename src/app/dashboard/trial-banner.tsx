import type { PlanId } from "@/lib/billing/entitlement";

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * Trial countdown. Phase 6 turns "Add payment" into a real Stripe Checkout
 * link; the copy and placement are already where they need to be.
 */
export function TrialBanner({
  plan,
  trialEndsAt,
}: {
  plan: PlanId;
  trialEndsAt: string | null;
}) {
  if (plan === "none") {
    return (
      <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-center text-sm text-red-900">
        Your subscription has ended. Your sites are offline until you renew — your work is safe.
      </div>
    );
  }

  if (plan !== "trialing" || !trialEndsAt) return null;

  const days = daysLeft(trialEndsAt);

  return (
    <div className="border-b border-blue-200 bg-blue-50 px-6 py-2.5 text-center text-sm text-blue-900">
      {days === 0
        ? "Your trial ends today."
        : `${days} ${days === 1 ? "day" : "days"} left in your free trial.`}
    </div>
  );
}
