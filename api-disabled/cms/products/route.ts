import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/adminAuth";
import {
  createNextProductId,
  readProductsForCms,
  writeProductsForCms,
} from "@/lib/productsCms";
import { Product } from "@/types";

function validateProduct(product: Product) {
  if (!product.id || !product.slug || !product.title) {
    return "Product id, slug and title are required.";
  }

  if (!Number.isFinite(product.price) || product.price < 0) {
    return "Price must be a valid non-negative number.";
  }

  if (!product.specifications.length) {
    return "At least one specification is required.";
  }

  if (product.sku && !product.sku.trim()) {
    return "SKU cannot be blank when provided.";
  }

  return null;
}

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const products = await readProductsForCms();
  return NextResponse.json({ products }, { status: 200 });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { product?: Product };
    if (!body.product) {
      return NextResponse.json({ message: "Product payload is required." }, { status: 400 });
    }

    const products = await readProductsForCms();

    const productToCreate: Product = {
      ...body.product,
      id: body.product.id || createNextProductId(products),
    };

    const validationError = validateProduct(productToCreate);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    if (products.some((product) => product.id === productToCreate.id)) {
      return NextResponse.json({ message: "Product id already exists." }, { status: 400 });
    }

    if (products.some((product) => product.slug === productToCreate.slug)) {
      return NextResponse.json({ message: "Product slug already exists." }, { status: 400 });
    }

    if (
      productToCreate.sku &&
      products.some(
        (product) =>
          product.sku?.trim().toLowerCase() === productToCreate.sku?.trim().toLowerCase(),
      )
    ) {
      return NextResponse.json({ message: "Product SKU already exists." }, { status: 400 });
    }

    const nextProducts = [...products, productToCreate];
    await writeProductsForCms(nextProducts);

    return NextResponse.json({ product: productToCreate }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create product.";
    return NextResponse.json(
      {
        message:
          "CMS write failed. Configure KV_REST_API_URL and KV_REST_API_TOKEN for production live edits.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { product?: Product };
    if (!body.product) {
      return NextResponse.json({ message: "Product payload is required." }, { status: 400 });
    }

    const validationError = validateProduct(body.product);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

    const products = await readProductsForCms();
    const index = products.findIndex((product) => product.id === body.product?.id);

    if (index < 0) {
      return NextResponse.json({ message: "Product not found." }, { status: 404 });
    }

    const duplicateSlug = products.some(
      (product, candidateIndex) =>
        candidateIndex !== index && product.slug === body.product?.slug,
    );

    if (duplicateSlug) {
      return NextResponse.json({ message: "Product slug already exists." }, { status: 400 });
    }

    const duplicateSku =
      body.product.sku &&
      products.some(
        (product, candidateIndex) =>
          candidateIndex !== index &&
          product.sku?.trim().toLowerCase() === body.product?.sku?.trim().toLowerCase(),
      );

    if (duplicateSku) {
      return NextResponse.json({ message: "Product SKU already exists." }, { status: 400 });
    }

    products[index] = body.product;
    await writeProductsForCms(products);

    return NextResponse.json({ product: body.product }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update product.";
    return NextResponse.json(
      {
        message:
          "CMS write failed. Configure KV_REST_API_URL and KV_REST_API_TOKEN for production live edits.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { productId?: string };
    if (!body.productId) {
      return NextResponse.json({ message: "productId is required." }, { status: 400 });
    }

    const products = await readProductsForCms();
    const nextProducts = products.filter((product) => product.id !== body.productId);

    if (nextProducts.length === products.length) {
      return NextResponse.json({ message: "Product not found." }, { status: 404 });
    }

    await writeProductsForCms(nextProducts);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete product.";
    return NextResponse.json(
      {
        message:
          "CMS write failed. Configure KV_REST_API_URL and KV_REST_API_TOKEN for production live edits.",
        detail: message,
      },
      { status: 500 },
    );
  }
}
