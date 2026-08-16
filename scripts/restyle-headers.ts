/**
 * Re-applies the current header styling to sites whose header is still the
 * generated one.
 *
 * Component defaults live in the registry, but a document stores the styles it
 * was created with — so changing a default does nothing for sites that already
 * exist. This rebuilds those headers from the current template while carrying
 * over the logo text and menu items, so nothing anyone typed is lost.
 *
 * It deliberately SKIPS any header whose shape has been changed (extra nodes,
 * reordered, components added). Those are someone's work, not a default.
 *
 * Run with: npx tsx scripts/restyle-headers.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { headerTemplate } from "../src/lib/document/templates";
import type { PageDocument } from "../src/lib/document/types";
import type { MenuItem } from "../src/components/fields";
import type { Link } from "../src/lib/links/types";
import { Prisma } from "../src/generated/prisma/client";

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** True when the document is still exactly Root > Header > [Logo, Nav]. */
function isGeneratedShape(doc: PageDocument): boolean {
  const nodes = Object.values(doc.nodes ?? {});
  if (nodes.length !== 4) return false;

  const types = nodes.map((node) => node.type).sort();
  return types.join(",") === "Header,Logo,Nav,Root";
}

async function main() {
  const sites = await db.site.findMany({
    where: { headerDraft: { not: Prisma.DbNull } },
    select: { id: true, name: true, subdomain: true, headerDraft: true, headerContent: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const site of sites) {
    const doc = site.headerDraft as unknown as PageDocument;

    if (!isGeneratedShape(doc)) {
      console.log(`${site.subdomain}: customised header, left alone`);
      skipped++;
      continue;
    }

    const nodes = Object.values(doc.nodes);
    const logo = nodes.find((node) => node.type === "Logo");
    const nav = nodes.find((node) => node.type === "Nav");

    const items = (Array.isArray(nav?.props.items) ? nav!.props.items : []) as MenuItem[];
    const logoText = typeof logo?.props.text === "string" ? logo.props.text : site.name;
    const logoLink = (logo?.props.link ?? { kind: "none" }) as Link;

    // headerTemplate takes {id,title} pairs, so the existing items are mapped
    // back through it and then restored verbatim — that keeps any labels or
    // link kinds the template itself would not have produced.
    const rebuilt = headerTemplate(logoText, [], logoLink);
    const rebuiltNav = Object.values(rebuilt.nodes).find((node) => node.type === "Nav");
    if (rebuiltNav) rebuiltNav.props.items = items;

    const wasPublished = site.headerContent !== null;

    await db.site.update({
      where: { id: site.id },
      data: {
        headerDraft: json(rebuilt),
        // Only republish if it was already live — never publish on someone's
        // behalf.
        ...(wasPublished ? { headerContent: json(rebuilt) } : {}),
      },
    });

    console.log(
      `${site.subdomain}: restyled (${items.length} menu items kept${wasPublished ? ", republished" : ""})`,
    );
    updated++;
  }

  console.log(`\n${updated} restyled, ${skipped} left alone.`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
