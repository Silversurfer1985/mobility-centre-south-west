import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/adminAuth";
import { readProductsForCms, writeProductsForCms } from "@/lib/productsCms";
import { Product, ProductCategorySlug } from "@/types";

type PosProduct = {
  sku: string;
  posProductId: string;
  name?: string;
  active: boolean;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt?: string;
  sellingPricePence?: number;
  imageUrl?: string;
  publicDescription?: string;
  categoryName?: string;
  stripeProductId?: string;
  stripePriceId?: string;
};

type PosExportPayload = {
  ok: boolean;
  products?: PosProduct[];
  message?: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

const CATEGORY_KEYWORDS: Array<[string[], ProductCategorySlug]> = [
  [["scooter"], "mobility-scooters"],
  [["wheelchair"], "wheelchairs"],
  [["rollator", "walking", "stick", "crutch", "walker"], "rollators-walking-aids"],
  [["hoist", "sling"], "patient-hoists"],
  [["profiling", "care bed", "adjustable bed"], "profiling-beds"],
  [["mattress", "pressure", "overlay"], "pressure-care-mattresses"],
  [["incontinence", "pad"], "incontinence-pads-elderly-care-pads"],
  [["glove", "apron", "mask"], "gloves-aprons-masks"],
  [["cleaning", "sanitiser", "sanitary"], "cleaning-sanitary-products"],
  [["ppe", "protective"], "ppe"],
  [["bath", "shower", "toilet", "commode"], "bathroom-aids"],
  [["grab", "rail", "ramp"], "grab-rails"],
  [["stairlift", "stair lift"], "stairlift-enquiries"],
  [["lift"], "platform-lift-enquiries"],
];

function detectCategory(name: string, categoryName?: string): ProductCategorySlug {
  const haystack = `${name} ${categoryName ?? ""}`.toLowerCase();

  for (const [keywords, slug] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      return slug;
    }
  }

  return "mobility-scooters";
}

function mapPosToWebshop(pos: PosProduct, existing: Product | undefined): Product {
  const title = pos.name ?? existing?.title ?? pos.sku;
  const price = typeof pos.sellingPricePence === "number" ? pos.sellingPricePence / 100 : (existing?.price ?? 0);
  const image = pos.imageUrl ?? existing?.image ?? "/images/products/placeholder-product.svg";
  const shortDescription = pos.publicDescription ?? existing?.shortDescription ?? "";
  const category = existing?.category ?? detectCategory(title, pos.categoryName);

  // Preserve webshop-specific fields if product already exists
  const specifications: Product["specifications"] =
    existing?.specifications?.length
      ? existing.specifications
      : shortDescription
      ? [{ key: "Description", value: shortDescription.slice(0, 200) }]
      : [{ key: "Product", value: title }];

  return {
    // Webshop-specific preserved fields
    vatNote: existing?.vatNote ?? "VAT relief may apply for eligible customers.",
    brand: existing?.brand ?? "MCSW Mobility",
    useType: existing?.useType ?? "Home Use",
    longDescription: existing?.longDescription ?? shortDescription,
    deliveryInformation: existing?.deliveryInformation ?? "Standard delivery in 3–5 working days.",
    featured: existing?.featured ?? false,
    bestSeller: existing?.bestSeller ?? false,
    requiresEnquiry: existing?.requiresEnquiry ?? false,
    // POS-sourced fields (always updated)
    id: pos.sku,
    sku: pos.sku,
    slug: existing?.slug || slugify(title) || pos.sku,
    title,
    category,
    price,
    shortDescription,
    specifications,
    image,
    stockQuantity: pos.stockQuantity,
    reservedQuantity: pos.reservedQuantity,
    availableQuantity: pos.availableQuantity,
    stockLastSyncedAt: new Date().toISOString(),
    stockSource: "pos",
  };
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const posBaseUrl = process.env.POS_STOCK_SOURCE_URL?.trim();
  const posSyncKey = process.env.POS_STOCK_SYNC_KEY?.trim();

  if (!posBaseUrl || !posSyncKey) {
    return NextResponse.json(
      { ok: false, message: "POS_STOCK_SOURCE_URL and POS_STOCK_SYNC_KEY must be configured." },
      { status: 503 },
    );
  }

  const sourceUrl = `${posBaseUrl.replace(/\/$/, "")}/api/integrations/stock-export`;

  let payload: PosExportPayload;

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: { "x-stock-sync-key": posSyncKey },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => ({}))) as PosExportPayload;
    if (!response.ok || !body.ok) {
      return NextResponse.json(
        { ok: false, message: body.message ?? `POS export failed with status ${response.status}.` },
        { status: 502 },
      );
    }

    payload = body;
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to fetch POS catalog." },
      { status: 502 },
    );
  }

  const posProducts = (payload.products ?? []).filter((p) => p.active && p.sku);

  const existingProducts = await readProductsForCms();
  const existingBySkuOrId = new Map<string, Product>();
  for (const p of existingProducts) {
    if (p.sku) existingBySkuOrId.set(p.sku.trim().toLowerCase(), p);
    existingBySkuOrId.set(p.id.trim().toLowerCase(), p);
  }

  // Build updated list: start with existing products not coming from POS, then upsert POS ones
  const posSkus = new Set(posProducts.map((p) => p.sku.trim().toLowerCase()));
  const nonPosProducts = existingProducts.filter(
    (p) => !posSkus.has((p.sku ?? p.id).trim().toLowerCase()),
  );

  const syncedProducts: Product[] = posProducts.map((pos) => {
    const existing =
      existingBySkuOrId.get(pos.sku.trim().toLowerCase()) ??
      existingBySkuOrId.get(pos.posProductId.trim().toLowerCase());
    return mapPosToWebshop(pos, existing);
  });

  // Ensure slugs are unique
  const usedSlugs = new Set(nonPosProducts.map((p) => p.slug));
  for (const p of syncedProducts) {
    let slug = p.slug;
    let counter = 2;
    while (usedSlugs.has(slug)) {
      slug = `${p.slug}-${counter}`;
      counter++;
    }
    p.slug = slug;
    usedSlugs.add(slug);
  }

  const finalProducts = [...nonPosProducts, ...syncedProducts];
  await writeProductsForCms(finalProducts);

  return NextResponse.json({
    ok: true,
    summary: {
      posProductsImported: syncedProducts.length,
      existingWebshopOnlyProducts: nonPosProducts.length,
      totalProducts: finalProducts.length,
    },
  });
}
