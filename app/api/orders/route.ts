import { NextResponse } from "next/server";
import { getRecentOrders } from "@/lib/orders";
import { isAuthorizedRequest } from "@/lib/adminAuth";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const orders = await getRecentOrders(100);
  return NextResponse.json({ orders }, { status: 200 });
}
