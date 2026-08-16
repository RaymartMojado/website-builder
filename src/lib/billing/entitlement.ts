import { db } from "@/lib/db";
import { PaymentRequiredError } from "@/lib/errors";

/**
 * Entitlement — the seam that Phase 6 fills in.
 *
 * Everything that needs to know what a user is allowed to do calls
 * getEntitlement(). Today it reads the Subscription row if there is one and
 * otherwise hands back a trial. When Stripe lands, only the body of this file
 * changes — no call site moves.
 *
 * The rule that shapes the whole design: gate PUBLISHING and QUOTA, never
 * EDITING. Someone whose card just failed must still be able to open their
 * work, fix their billing, and republish.
 */

export type PlanId = "trialing" | "starter" | "pro" | "none";

export interface Limits {
  sites: number;
  pagesPerSite: number;
  storageBytes: number;
  customDomains: boolean;
  customCode: boolean;
  forms: boolean;
  removeBadge: boolean;
}

export interface Entitlement {
  plan: PlanId;
  limits: Limits;
  /** Can they publish, i.e. serve content to the public? */
  canPublish: boolean;
  /** Set while a past_due subscription is still inside its grace window. */
  graceUntil?: Date;
  /** Set while trialing. Drives the countdown banner. */
  trialEndsAt?: Date;
}

const GB = 1024 * 1024 * 1024;

export const PLAN_LIMITS: Record<PlanId, Limits> = {
  trialing: {
    sites: 3,
    pagesPerSite: 20,
    storageBytes: GB,
    customDomains: false,
    customCode: false,
    forms: false,
    removeBadge: false,
  },
  starter: {
    sites: 3,
    pagesPerSite: 20,
    storageBytes: GB,
    customDomains: false,
    customCode: false,
    forms: false,
    removeBadge: false,
  },
  pro: {
    sites: Number.POSITIVE_INFINITY,
    pagesPerSite: Number.POSITIVE_INFINITY,
    storageBytes: 10 * GB,
    customDomains: true,
    customCode: true,
    forms: true,
    removeBadge: true,
  },
  none: {
    sites: 0,
    pagesPerSite: 0,
    storageBytes: 0,
    customDomains: false,
    customCode: false,
    forms: false,
    removeBadge: false,
  },
};

/** How long a past_due subscription keeps working while dunning runs. */
const GRACE_DAYS = 7;

/**
 * Phase 0: no Stripe yet, so a user without a Subscription row is treated as
 * trialing. Phase 6 replaces this branch with a real trial window derived from
 * the Stripe subscription.
 */
const PHASE_0_TRIAL_DAYS = 7;

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const subscription = await db.subscription.findUnique({ where: { userId } });

  if (!subscription) {
    const profile = await db.profile.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    const trialEndsAt = new Date(
      (profile?.createdAt ?? new Date()).getTime() + PHASE_0_TRIAL_DAYS * 86_400_000,
    );
    return {
      plan: "trialing",
      limits: PLAN_LIMITS.trialing,
      canPublish: true,
      trialEndsAt,
    };
  }

  const planForPrice = (priceId: string): PlanId =>
    priceId.includes("pro") ? "pro" : "starter";

  switch (subscription.status) {
    case "trialing":
      return {
        plan: "trialing",
        limits: PLAN_LIMITS.trialing,
        canPublish: true,
        trialEndsAt: subscription.trialEndsAt ?? undefined,
      };

    case "active":
      return {
        plan: planForPrice(subscription.priceId),
        limits: PLAN_LIMITS[planForPrice(subscription.priceId)],
        canPublish: true,
      };

    case "past_due": {
      const graceUntil = new Date(
        subscription.currentPeriodEnd.getTime() + GRACE_DAYS * 86_400_000,
      );
      const inGrace = graceUntil > new Date();
      const plan = planForPrice(subscription.priceId);
      return {
        plan: inGrace ? plan : "none",
        limits: inGrace ? PLAN_LIMITS[plan] : PLAN_LIMITS.none,
        canPublish: inGrace,
        graceUntil,
      };
    }

    default: // canceled | unpaid | anything Stripe adds later
      return { plan: "none", limits: PLAN_LIMITS.none, canPublish: false };
  }
}

/** Throws unless the user may create another site. */
export async function assertCanCreateSite(userId: string): Promise<void> {
  const entitlement = await getEntitlement(userId);
  const count = await db.site.count({ where: { ownerId: userId } });

  if (count >= entitlement.limits.sites) {
    throw new PaymentRequiredError(
      entitlement.limits.sites === 0
        ? "Your subscription has ended. Renew to create sites."
        : `Your plan includes ${entitlement.limits.sites} sites. Upgrade to add more.`,
    );
  }
}

/** Throws unless the user may publish. Never called on an edit path. */
export async function assertCanPublish(userId: string): Promise<void> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement.canPublish) {
    throw new PaymentRequiredError("Renew your subscription to publish changes.");
  }
}
