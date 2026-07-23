export type ProductCategorySlug =
  | "mobility-scooters"
  | "wheelchairs"
  | "rollators-walking-aids"
  | "patient-hoists"
  | "slings"
  | "profiling-beds"
  | "pressure-care-mattresses"
  | "incontinence-pads-elderly-care-pads"
  | "ppe"
  | "gloves-aprons-masks"
  | "cleaning-sanitary-products"
  | "care-home-consumables"
  | "bathroom-aids"
  | "shower-chairs"
  | "commodes"
  | "grab-rails"
  | "ramps"
  | "daily-living-aids"
  | "stairlift-enquiries"
  | "platform-lift-enquiries"
  | "lift-maintenance-enquiries";

export type UseType =
  | "Home Use"
  | "Care Home"
  | "NHS / Clinical"
  | "Hospitality"
  | "Council / Public Sector"
  | "Commercial";

export interface Category {
  slug: ProductCategorySlug;
  name: string;
  description: string;
  imageAlt: string;
}

export interface Product {
  id: string;
  sku?: string;
  slug: string;
  title: string;
  category: ProductCategorySlug;
  price: number;
  vatNote: string;
  brand: string;
  useType: UseType;
  shortDescription: string;
  longDescription: string;
  specifications: Array<{ key: string; value: string }>;
  deliveryInformation: string;
  image: string;
  stockQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  stockLastSyncedAt?: string;
  stockSource?: "pos";
  featured?: boolean;
  bestSeller?: boolean;
  requiresEnquiry?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  purchasePlan?: "one-time" | "monthly-prescription";
}

export interface PersistedOrderLineItem {
  description: string;
  quantity: number;
  amountTotal: number;
  currency: string;
}

export interface OrderRecord {
  id: string;
  sessionId: string;
  paymentIntentId: string | null;
  paymentStatus: string;
  amountTotal: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  createdAt: string;
  lineItems: PersistedOrderLineItem[];
}

export interface WebhookEventRecord {
  id: string;
  eventId: string;
  eventType: string;
  status: "processed" | "ignored" | "failed";
  message: string;
  receivedAt: string;
  processedAt: string;
  attempt: number;
  isReplay: boolean;
  sessionId?: string;
  customerEmail?: string | null;
}
