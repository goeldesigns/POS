export interface AppNotification {
  id: string;
  kind: "stock" | "kitchen" | "reservation" | "online" | "payment";
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "info" | "brand";
  at: string;
}
