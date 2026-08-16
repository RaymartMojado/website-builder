/**
 * One-off: gives a header and footer to sites created before shared regions
 * existed, and a home page to any site that has none.
 *
 * Safe to re-run — it only fills in what is missing, never overwrites.
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import {
  documentFrom,
  footerTemplate,
  headerTemplate,
} from "../src/lib/document/templates";
import type { Prisma } from "../src/generated/prisma/client";

const json = (value: unknown) => value as Prisma.InputJsonValue;

async function main() {
  const sites = await db.site.findMany({
    select: {
      id: true,
      name: true,
      subdomain: true,
      headerDraft: true,
      footerDraft: true,
      pages: { select: { id: true, title: true }, orderBy: { order: "asc" } },
    },
  });

  for (const site of sites) {
    let pages = site.pages;

    if (pages.length === 0) {
      const page = await db.page.create({
        data: {
          siteId: site.id,
          kind: "HOME",
          path: "/",
          title: "Home",
          order: 0,
          draftContent: json(
            documentFrom([
              {
                type: "Section",
                children: [
                  {
                    type: "Container",
                    children: [
                      { type: "Heading", props: { text: site.name, level: "h1" } },
                      {
                        type: "Text",
                        props: { text: "Drag components from the left to start building." },
                      },
                    ],
                  },
                ],
              },
            ]),
          ),
        },
        select: { id: true, title: true },
      });
      pages = [page];
      console.log(`${site.subdomain}: added a home page`);
    }

    const data: Prisma.SiteUpdateInput = {};

    if (!site.headerDraft) {
      data.headerDraft = json(
        headerTemplate(site.name, pages, { kind: "page", pageId: pages[0]!.id }),
      );
    }
    if (!site.footerDraft) {
      data.footerDraft = json(footerTemplate(site.name));
    }

    if (Object.keys(data).length > 0) {
      await db.site.update({ where: { id: site.id }, data });
      console.log(`${site.subdomain}: added ${Object.keys(data).join(" and ")}`);
    }
  }

  console.log("Done.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
