import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * `/` is served on both the marketing host and the app host, because both
 * resolve to this same Next app. proxy.ts tags the surface; the app host sends
 * people to their dashboard rather than a marketing page.
 */
export default async function HomePage() {
  const surface = (await headers()).get("x-surface");
  if (surface === "app") redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-blue-700">Website Builder</p>
      <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        Build a site. Publish it. No code.
      </h1>
      <p className="max-w-prose text-lg text-neutral-600">
        Drag components onto a canvas, wire up your pages and navigation, and publish to a live
        address. Free for 7 days.
      </p>
      <div>
        <Link
          href="/signin"
          className="inline-flex rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          Start building
        </Link>
      </div>
    </main>
  );
}
