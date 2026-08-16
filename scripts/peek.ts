import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const sites = await db.site.findMany({
    select: {
      name: true,
      subdomain: true,
      status: true,
      pages: { select: { id: true, title: true, path: true, publishedContent: true }, orderBy: { order: "asc" } },
    },
  });

  const profiles = await db.profile.findMany({ select: { email: true } });
  console.log("profiles:", profiles.map((p) => p.email).join(", ") || "(none)");

  for (const site of sites) {
    console.log(`\n${site.subdomain} [${site.status}] — ${site.name}`);
    for (const page of site.pages) {
      console.log(
        `  ${page.path.padEnd(10)} ${page.publishedContent ? "published" : "draft    "}  editor: /dashboard/editor/${page.id}`,
      );
    }
  }

  await db.$disconnect();
}

main();
