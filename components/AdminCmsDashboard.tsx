"use client";

import Image from "next/image";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { categories } from "@/data/categories";
import { Product, UseType } from "@/types";

const ADMIN_TOKEN_STORAGE_KEY = "mcsw-admin-token";

const useTypeOptions: UseType[] = [
  "Home Use",
  "Care Home",
  "NHS / Clinical",
  "Hospitality",
  "Council / Public Sector",
  "Commercial",
];

const emptyProduct: Product = {
  id: "",
  sku: "",
  slug: "",
  title: "",
  category: "mobility-scooters",
  price: 0,
  vatNote: "VAT included.",
  brand: "",
  useType: "Home Use",
  shortDescription: "",
  longDescription: "",
  specifications: [{ key: "", value: "" }],
  deliveryInformation: "",
  image: "/images/products/placeholder-product.svg",
  featured: false,
  bestSeller: false,
  requiresEnquiry: false,
};

function specsToText(specs: Product["specifications"]) {
  return specs.map((spec) => `${spec.key}: ${spec.value}`).join("\n");
}

function textToSpecs(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split(":");
      return {
        key: key?.trim() ?? "",
        value: rest.join(":").trim(),
      };
    })
    .filter((spec) => spec.key && spec.value);
}

export function AdminCmsDashboard() {
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Load products to begin.");
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [draft, setDraft] = useState<Product>(emptyProduct);
  const [specText, setSpecText] = useState(specsToText(emptyProduct.specifications));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (selectedImagePreview) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  );

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) {
      return products;
    }

    return products.filter((product) =>
      [product.id, product.title, product.slug, product.brand]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [products, query]);

  const headers = () => {
    const nextToken = token.trim();
    return nextToken ? ({ "x-admin-token": nextToken } as HeadersInit) : {};
  };

  const loadProducts = async () => {
    setLoading(true);
    setStatus("Loading products...");

    const response = await fetch("/api/cms/products", {
      headers: headers(),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string; detail?: string };
      setStatus(errorData.detail ? `${errorData.message} (${errorData.detail})` : errorData.message ?? "Unable to load products.");
      setLoading(false);
      return;
    }

    const data = (await response.json()) as { products: Product[] };
    setProducts(data.products ?? []);
    setStatus(`Loaded ${data.products?.length ?? 0} products.`);
    setLoading(false);

    if (data.products?.length) {
      const first = data.products[0];
      setSelectedId(first.id);
      setDraft(first);
      setSpecText(specsToText(first.specifications));
    }
  };

  const saveTokenAndLoad = async () => {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
    await loadProducts();
  };

  const syncStockFromPos = async () => {
    setStatus("Syncing stock from POS...");
    const response = await fetch("/api/integrations/pos-stock-sync", {
      method: "POST",
      headers: { ...headers() },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      summary?: { matchedCount: number; unmatchedPosSkuCount: number; totalPosProducts: number };
    };

    if (!response.ok || !payload.ok) {
      setStatus(payload.message ?? "Stock sync failed.");
      return;
    }

    const summary = payload.summary;
    setStatus(
      `Stock sync complete. Matched ${summary?.matchedCount ?? 0}/${summary?.totalPosProducts ?? 0} POS products. Unmatched SKUs: ${summary?.unmatchedPosSkuCount ?? 0}.`,
    );
    await loadProducts();
  };

  const syncCatalogFromPos = async () => {
    if (
      !window.confirm(
        "This will replace all POS-linked products with the latest data from your POS database. Webshop-only products are kept. Continue?",
      )
    ) {
      return;
    }

    setStatus("Importing product catalog from POS...");
    const response = await fetch("/api/integrations/pos-catalog-sync", {
      method: "POST",
      headers: { ...headers() },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      summary?: { posProductsImported: number; existingWebshopOnlyProducts: number; totalProducts: number };
    };

    if (!response.ok || !payload.ok) {
      setStatus(payload.message ?? "Catalog sync failed.");
      return;
    }

    const s = payload.summary;
    setStatus(
      `Catalog sync complete. ${s?.posProductsImported ?? 0} POS products imported. ${s?.existingWebshopOnlyProducts ?? 0} webshop-only products kept. Total: ${s?.totalProducts ?? 0}.`,
    );
    await loadProducts();
  };

  const selectProduct = (product: Product) => {
    setSelectedId(product.id);
    setDraft(product);
    setSpecText(specsToText(product.specifications));
  };

  const createNew = () => {
    setSelectedId(null);
    setDraft(emptyProduct);
    setSpecText(specsToText(emptyProduct.specifications));
    setStatus("Creating new product draft.");
  };

  const applySpecText = () => {
    const parsed = textToSpecs(specText);
    setDraft((previous) => ({
      ...previous,
      specifications: parsed.length ? parsed : [{ key: "Feature", value: "Add details" }],
    }));
  };

  const saveProduct = async () => {
    applySpecText();

    const payload: Product = {
      ...draft,
      specifications: textToSpecs(specText),
      price: Number(draft.price),
    };

    const method = selectedId ? "PATCH" : "POST";
    const response = await fetch("/api/cms/products", {
      method,
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product: payload }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      detail?: string;
      product?: Product;
    };

    if (!response.ok) {
      setStatus(result.detail ? `${result.message} (${result.detail})` : result.message ?? "Unable to save product.");
      return;
    }

    setStatus(selectedId ? "Product updated." : "Product created.");
    await loadProducts();

    const savedId = result.product?.id ?? payload.id;
    const saved = (result.product ?? payload) as Product;
    if (savedId) {
      setSelectedId(savedId);
      setDraft(saved);
      setSpecText(specsToText(saved.specifications));
    }
  };

  const deleteProduct = async () => {
    if (!selectedId) {
      setStatus("Select a saved product before deleting.");
      return;
    }

    const response = await fetch("/api/cms/products", {
      method: "DELETE",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId: selectedId }),
    });

    const result = (await response.json().catch(() => ({}))) as { message?: string; detail?: string };

    if (!response.ok) {
      setStatus(result.detail ? `${result.message} (${result.detail})` : result.message ?? "Delete failed.");
      return;
    }

    setStatus("Product deleted.");
    setSelectedId(null);
    setDraft(emptyProduct);
    setSpecText(specsToText(emptyProduct.specifications));
    await loadProducts();
  };

  const duplicateProduct = () => {
    const next = {
      ...draft,
      id: "",
      slug: `${draft.slug}-copy`,
      title: `${draft.title} Copy`,
    };
    setSelectedId(null);
    setDraft(next);
    setSpecText(specsToText(next.specifications));
    setStatus("Product duplicated. Save to create a new item.");
  };

  const handleImageFileChange = (file: File | null) => {
    if (selectedImagePreview) {
      URL.revokeObjectURL(selectedImagePreview);
    }

    setSelectedImageFile(file);
    setSelectedImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleImageFileChange(event.dataTransfer.files?.[0] ?? null);
  };

  const uploadImage = async () => {
    if (!selectedImageFile) {
      setStatus("Choose an image first.");
      return;
    }

    setUploadingImage(true);
    setStatus("Uploading image...");

    const formData = new FormData();
    formData.append("image", selectedImageFile);

    const response = await fetch("/api/cms/images", {
      method: "POST",
      headers: headers(),
      body: formData,
    });

    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      detail?: string;
      url?: string;
    };

    if (!response.ok || !result.url) {
      setStatus(
        result.detail
          ? `${result.message} (${result.detail})`
          : result.message ?? "Image upload failed.",
      );
      setUploadingImage(false);
      return;
    }

    setDraft((previous) => ({
      ...previous,
      image: result.url as string,
    }));
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    setStatus("Image uploaded. Save Product to persist this image URL.");
    setUploadingImage(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h1 className="typography-page-header-title text-slate-900">CMS Product Manager</h1>
        <p className="mt-2 text-slate-600">
          Edit products visually without touching code. Changes save to live storage when KV is configured.
        </p>
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Note: set KV_REST_API_URL and KV_REST_API_TOKEN in production for instant live updates.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Admin token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Enter ORDER_ADMIN_TOKEN"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-3"
            />
          </label>
          <button
            type="button"
            onClick={saveTokenAndLoad}
            className="rounded-md bg-sky-900 px-5 py-3 font-semibold text-white hover:bg-sky-800"
          >
            Save & Load
          </button>
          <button
            type="button"
            onClick={createNew}
            className="rounded-md border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100"
          >
            New Product
          </button>
          <button
            type="button"
            onClick={syncStockFromPos}
            className="rounded-md border border-emerald-300 px-5 py-3 font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Sync Stock From POS
          </button>
          <button
            type="button"
            onClick={syncCatalogFromPos}
            className="rounded-md border border-sky-300 px-5 py-3 font-semibold text-sky-700 hover:bg-sky-50"
          >
            Sync Catalog From POS
          </button>
          <button
            type="button"
            onClick={duplicateProduct}
            className="rounded-md border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Duplicate
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-600">{loading ? "Working..." : status}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Items</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, id, slug"
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <div className="mt-3 max-h-[65vh] space-y-2 overflow-auto pr-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selectedProduct?.id === product.id
                    ? "border-sky-400 bg-sky-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="font-semibold text-slate-900">{product.title}</p>
                <p className="text-xs text-slate-500">
                  {product.id} · {product.slug}
                  {product.sku ? ` · SKU: ${product.sku}` : ""}
                </p>
              </button>
            ))}
            {!filteredProducts.length ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">No products found.</p>
            ) : null}
          </div>
        </aside>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Editor</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Product ID">
              <input
                value={draft.id}
                onChange={(event) => setDraft({ ...draft, id: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="MC-1001"
              />
            </Field>
            <Field label="SKU (for POS stock sync)">
              <input
                value={draft.sku ?? ""}
                onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="MCSW-SKU-001"
              />
            </Field>
            <Field label="Slug">
              <input
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="portable-mobility-scooter"
              />
            </Field>
            <Field label="Title" className="md:col-span-2">
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value as Product["category"] })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {categories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Use Type">
              <select
                value={draft.useType}
                onChange={(event) => setDraft({ ...draft, useType: event.target.value as UseType })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {useTypeOptions.map((useType) => (
                  <option key={useType} value={useType}>
                    {useType}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Price (GBP)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Brand">
              <input
                value={draft.brand}
                onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Image Path" className="md:col-span-2">
              <div className="space-y-2">
                <input
                  value={draft.image}
                  onChange={(event) => setDraft({ ...draft, image: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  placeholder="/images/products/new-image.jpg or https://..."
                />
                <p className="text-xs text-slate-500">
                  Replace the current image by choosing a new file below.
                </p>
                <div
                  onClick={openFilePicker}
                  onDragEnter={() => setDragActive(true)}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDrop={handleDrop}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openFilePicker();
                    }
                  }}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-4 transition ${
                    dragActive
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400 hover:bg-emerald-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleImageFileChange(event.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        Drag an image here or click to choose
                      </p>
                      <p className="text-xs text-emerald-800">
                        JPG, PNG, GIF or WebP. The upload creates a public Blob URL.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openFilePicker();
                      }}
                      className="rounded-md border border-emerald-300 bg-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-300"
                    >
                      Choose File
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={uploadImage}
                    disabled={uploadingImage || !selectedImageFile}
                    className="rounded-md border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? "Uploading..." : "Upload Image"}
                  </button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Current image
                    </p>
                    <div className="relative mt-2 aspect-[3/2] overflow-hidden rounded-md bg-white p-2 sm:aspect-[4/3]">
                      <Image
                        src={draft.image || "/images/products/placeholder-product.svg"}
                        alt="Current product image"
                        fill
                        sizes="(max-width: 640px) 100vw, 240px"
                        className="object-contain"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Selected upload
                    </p>
                    {selectedImagePreview ? (
                      <div className="relative mt-2 aspect-[3/2] overflow-hidden rounded-md bg-white p-2 sm:aspect-[4/3]">
                        <Image
                          src={selectedImagePreview}
                          alt="Selected upload preview"
                          fill
                          sizes="(max-width: 640px) 100vw, 240px"
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div className="mt-2 flex aspect-[3/2] items-center justify-center rounded-md border border-dashed border-emerald-300 bg-white p-2 text-sm text-emerald-700 sm:aspect-[4/3]">
                        Choose a file to preview it here
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Field>
            <Field label="VAT Note" className="md:col-span-2">
              <input
                value={draft.vatNote}
                onChange={(event) => setDraft({ ...draft, vatNote: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Short Description" className="md:col-span-2">
              <textarea
                rows={3}
                value={draft.shortDescription}
                onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Long Description" className="md:col-span-2">
              <textarea
                rows={5}
                value={draft.longDescription}
                onChange={(event) => setDraft({ ...draft, longDescription: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Delivery Information" className="md:col-span-2">
              <textarea
                rows={3}
                value={draft.deliveryInformation}
                onChange={(event) => setDraft({ ...draft, deliveryInformation: event.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="Specifications (one per line: Key: Value)" className="md:col-span-2">
              <textarea
                rows={6}
                value={specText}
                onChange={(event) => setSpecText(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.featured)}
                onChange={(event) => setDraft({ ...draft, featured: event.target.checked })}
              />
              Featured
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.bestSeller)}
                onChange={(event) => setDraft({ ...draft, bestSeller: event.target.checked })}
              />
              Best Seller
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(draft.requiresEnquiry)}
                onChange={(event) => setDraft({ ...draft, requiresEnquiry: event.target.checked })}
              />
              Requires Enquiry
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveProduct}
              className="rounded-md bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Save Product
            </button>
            <button
              type="button"
              onClick={deleteProduct}
              className="rounded-md border border-rose-300 px-5 py-3 font-semibold text-rose-700 hover:bg-rose-50"
            >
              Delete Product
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`text-sm font-medium text-slate-700 ${className ?? ""}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
