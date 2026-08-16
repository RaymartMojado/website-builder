import { requireUserId } from "@/lib/auth/guards";
import { getEntitlement } from "@/lib/billing/entitlement";
import { publishedUrl } from "@/lib/sites/subdomain";
import { db } from "@/lib/db";
import { CreateSiteForm } from "../create-site-form";
import { SiteCard } from "../site-card";

export const metadata = { title: "Your sites · Website Builder" };

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [sites, entitlement] = await Promise.all([
    // Ownership-scoped, as every tenant query must be.
    db.site.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      include: {
        pages: {
          select: { id: true, title: true, path: true, publishedContent: true },
          orderBy: { order: "asc" },
        },
      },
    }),
    getEntitlement(userId),
  ]);

  const atLimit = sites.length >= entitlement.limits.sites;
  const limitLabel = Number.isFinite(entitlement.limits.sites)
    ? `${sites.length} of ${entitlement.limits.sites}`
    : `${sites.length}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Your sites</h1>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          {limitLabel} used
        </p>
      </div>

      {sites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">
            No sites yet. Create one below to get started.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              id={site.id}
              name={site.name}
              status={site.status}
              url={publishedUrl(site.subdomain)}
              updatedAt={site.updatedAt.toISOString()}
              pages={site.pages.map((page) => ({
                id: page.id,
                title: page.title,
                path: page.path,
                isPublished: page.publishedContent !== null,
              }))}
            />
          ))}
        </ul>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 text-base font-semibold">Create a site</h2>
        <p className="mb-4 text-sm text-neutral-600">
          Pick an address now — you can change it later.
        </p>
        <CreateSiteForm disabled={atLimit} sitesHost={process.env.NEXT_PUBLIC_SITES_HOST ?? ""} />
        {atLimit ? (
          <p className="mt-3 text-sm text-amber-800">
            You&apos;ve used all {entitlement.limits.sites} sites on your plan.
          </p>
        ) : null}
      </section>
    </div>
  );
}
