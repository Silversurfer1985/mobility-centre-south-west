import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/adminAuth";
import { readProductsForCms, writeProductsForCms } from "@/lib/productsCms";
import { Product } from "@/types";

type PosStockItem = {
  sku: string;
  stockQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
};

type PosExportPayload = {
  ok: boolean;
  products?: PosStockItem[];
  message?: string;
};

function normalizeSku(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toInt(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function applyStock(existing: Product, posItem: PosStockItem): Product {
  const stockQuantity = toInt(posItem.stockQuantity);
  const reservedQuantity = toInt(posItem.reservedQuantity);
  const availableQuantity =
    typeof posItem.availableQuantity === "number"
      ? toInt(posItem.availableQuantity)
      : Math.max(stockQuantity - reservedQuantity, 0);

  return {
    ...existing,
    stockQuantity,
    reservedQuantity,
    availableQuantity,
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
      {
        ok: false,
        message: "POS_STOCK_SOURCE_URL and POS_STOCK_SYNC_KEY must be configured.",
      },
      { status: 503 },
    );
  }

  const sourceUrl = `${posBaseUrl.replace(/\/$/, "")}/api/integrations/stock-export`;

  let payload: PosExportPayload;

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "x-stock-sync-key": posSyncKey,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => ({}))) as PosExportPayload;
    if (!response.ok || !body.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: body.message ?? `POS stock export failed with status ${response.status}.`,
        },
        { status: 502 },
      );
    }

    payload = body;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to fetch POS stock export.",
      },
      { status: 502 },
    );
  }

  const posProducts = payload.products ?? [];
  const posBySku = new Map<string, PosStockItem>();

  for (const product of posProducts) {
    const key = normalizeSku(product.sku);
    if (key) {
      posBySku.set(key, product);
    }
  }

  const currentProducts = await readProductsForCms();
  let matchedCount = 0;

  const updatedProducts = currentProducts.map((product) => {
    const key = normalizeSku(product.sku);
    if (!key) {
      return product;
    }

    const posItem = posBySku.get(key);
    if (!posItem) {
      return product;
    }

    matchedCount += 1;
    return applyStock(product, posItem);
  });

  await writeProductsForCms(updatedProducts);

  return NextResponse.json({
    ok: true,
    summary: {
      totalPosProducts: posBySku.size,
      matchedCount,
      unmatchedPosSkuCount: Math.max(posBySku.size - matchedCount, 0),
      webshopProductsWithSku: updatedProducts.filter((product) => normalizeSku(product.sku)).length,
    },
  });
}
