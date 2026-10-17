import type { ServiceContext } from "../auth/load-context";
import { backend } from "../backend/client";
import type { OrderDetail } from "./orders";

export interface PrintData {
  order: OrderDetail;
  restaurant: {
    name: string;
    legalName: string | null;
    phone: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    gstNumber: string | null;
    fssaiNumber: string | null;
    currency: string;
    timezone: string;
  };
  settings: {
    invoicePrefix: string;
    receiptHeader: string | null;
    receiptFooter: string | null;
    receiptShowGstin: boolean;
    receiptShowFssai: boolean;
    receiptPaperWidth: number;
  };
}

export async function getPrintData(_ctx: ServiceContext, orderId: string) {
  return backend.get<PrintData>(`/api/v1/orders/${orderId}/print`);
}
