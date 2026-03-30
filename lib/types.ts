export interface OrderItem {
  item: string;
  quantity: number;
  notes: string;
}

export interface OrderResult {
  orders: OrderItem[];
  perPersonSummary: string;
  analysis: {
    status: "adequate" | "light" | "generous";
    comment: string;
  };
}
