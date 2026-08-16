/**
 * One-off: gives a home page to any site created before sites started
 * creating one automatically. A site with no pages has nothing to open.
 *
 * Safe to re-run — it only touches sites that have zero pages.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { documentFrom } from "../src/lib/document/templates";
import type { Prisma } from "../src/generated/prisma/client";

async function main() {
  const pageless = await db.site.findMany({
    where: { pages: { none: {} } },
    select: { id: true, name: true, subdomain: true },
  });

  if (pageless.length === 0) {
    console.log("Nothing to backfill.");
    await db.$disconnect();
    return;
  }

  for (const site of pageless) {
    const document = documentFrom([
      {
        type: "Section",
        children: [
          {
            type: "Container",
            children: [
              { type: "Heading", props: { text: site.name, level: "h1" } },
              {
                type: "Text",
                props: { text: "Drag components from the left, or click one to add it here." },
              },
            ],
          },
        ],
      },
    ]);

    await db.page.create({
      data: {
        siteId: site.id,
        kind: "HOME",
        path: "/",
        title: "Home",
        order: 0,
        draftContent: document as unknown as Prisma.InputJsonValue,
      },
    });

    console.log(`added a home page to ${site.subdomain}`);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
