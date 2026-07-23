import { promises as fs } from "node:fs";
import path from "node:path";
import { kv } from "@vercel/kv";
import { products as fallbackProducts } from "@/data/products";
import { Product } from "@/types";

const productsFilePath = path.join(process.cwd(), "data", "products.ts");
const PRODUCTS_KV_KEY = "cms:products:v1";

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function parseProductsArrayLiteral(fileContent: string) {
  const match = fileContent.match(
    /export const products: Product\[\] = ([\s\S]*?\n\]);/,
  );

  if (!match) {
    throw new Error("Unable to locate products array in data/products.ts");
  }

  const literal = match[1];
  const parsed = Function(`"use strict"; return (${literal});`)() as Product[];

  if (!Array.isArray(parsed)) {
    throw new Error("Products array could not be parsed.");
  }

  return parsed;
}

function sanitizeProduct(product: Product): Product {
  return {
    ...product,
    id: product.id.trim(),
    sku: product.sku?.trim() || undefined,
    slug: product.slug.trim(),
    title: product.title.trim(),
    category: product.category,
    price: Number(product.price),
    vatNote: product.vatNote.trim(),
    brand: product.brand.trim(),
    useType: product.useType,
    shortDescription: product.shortDescription.trim(),
    longDescription: product.longDescription.trim(),
    deliveryInformation: product.deliveryInformation.trim(),
    image: product.image.trim(),
    stockQuantity:
      typeof product.stockQuantity === "number"
        ? Math.max(0, Math.floor(product.stockQuantity))
        : undefined,
    reservedQuantity:
      typeof product.reservedQuantity === "number"
        ? Math.max(0, Math.floor(product.reservedQuantity))
        : undefined,
    availableQuantity:
      typeof product.availableQuantity === "number"
        ? Math.max(0, Math.floor(product.availableQuantity))
        : undefined,
    stockLastSyncedAt: product.stockLastSyncedAt,
    stockSource: product.stockSource,
    specifications: product.specifications.map((spec) => ({
      key: spec.key.trim(),
      value: spec.value.trim(),
    })),
    featured: Boolean(product.featured),
    bestSeller: Boolean(product.bestSeller),
    requiresEnquiry: Boolean(product.requiresEnquiry),
  };
}

export async function readProductsFromFile() {
  const fileContent = await fs.readFile(productsFilePath, "utf8");
  return parseProductsArrayLiteral(fileContent);
}

export async function readProductsForCms() {
  if (hasKvConfig()) {
    const stored = await kv.get<Product[]>(PRODUCTS_KV_KEY);
    if (Array.isArray(stored) && stored.length) {
      return stored.map((product) => sanitizeProduct(product));
    }

    await kv.set(PRODUCTS_KV_KEY, fallbackProducts);
    return fallbackProducts.map((product) => sanitizeProduct(product));
  }

  return readProductsFromFile();
}

export async function writeProductsToFile(products: Product[]) {
  const fileContent = await fs.readFile(productsFilePath, "utf8");
  const sanitized = products.map(sanitizeProduct);
  const replacement = `export const products: Product[] = ${JSON.stringify(
    sanitized,
    null,
    2,
  )};`;

  const updated = fileContent.replace(
    /export const products: Product\[\] = ([\s\S]*?\n\]);/,
    replacement,
  );

  await fs.writeFile(productsFilePath, updated, "utf8");
}

export async function writeProductsForCms(products: Product[]) {
  const sanitized = products.map((product) => sanitizeProduct(product));

  if (hasKvConfig()) {
    await kv.set(PRODUCTS_KV_KEY, sanitized);
    return;
  }

  await writeProductsToFile(sanitized);
}

export function createNextProductId(products: Product[]) {
  const maxId = products.reduce((max, product) => {
    const match = product.id.match(/^MC-(\d+)$/);
    if (!match) {
      return max;
    }
    return Math.max(max, Number(match[1]));
  }, 1000);

  return `MC-${String(maxId + 1).padStart(4, "0")}`;
}
