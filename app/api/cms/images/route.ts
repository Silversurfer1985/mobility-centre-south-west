import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/adminAuth";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const blobToken =
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.STORAGE_BLOB_READ_WRITE_TOKEN;

    if (!blobToken) {
      return NextResponse.json(
        {
          message:
            "Image upload is not configured. Add BLOB_READ_WRITE_TOKEN or STORAGE_BLOB_READ_WRITE_TOKEN.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ message: "Image file is required." }, { status: 400 });
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ message: "Only image files are allowed." }, { status: 400 });
    }

    const safeName = sanitizeFileName(image.name || "upload-image");
    const storagePath = `products/${Date.now()}-${safeName}`;

    const uploaded = await put(storagePath, image, {
      access: "public",
      addRandomSuffix: false,
      token: blobToken,
    });

    return NextResponse.json(
      {
        url: uploaded.url,
        pathname: uploaded.pathname,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload image.";
    return NextResponse.json(
      {
        message:
          "Image upload failed. Configure Vercel Blob integration and BLOB_READ_WRITE_TOKEN.",
        detail: message,
      },
      { status: 500 },
    );
  }
}
