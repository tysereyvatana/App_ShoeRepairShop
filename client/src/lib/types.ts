export type Paged<T> = { data: T[]; page: number; pageSize: number; total: number };

export type UserInfo = { id: string; username: string; roles: string[] };

export type UserRow = {
  id: string;
  username: string;
  email: string | null;
  status: "ACTIVE" | "DISABLED";
  roles: string[];
  createdAt: string;
};

export type Item = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: string | null;
  cost: string; // Prisma Decimal serialized as string
  price: string;
  reorderLevel: number;
  active: boolean;
  createdAt: string;
  category?: { id: string; name: string } | null;
};

export type Customer = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
};

export type Supplier = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
};

export type Staff = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  position: string | null;
  salary: string;
  status: "ACTIVE" | "INACTIVE";
  userId: string | null;
  user?: { id: string; username: string } | null;
  createdAt: string;
};

export type PurchaseLine = {
  id: string;
  itemId: string;
  qty: number;
  unitCost: string;
  lineTotal: string;
  item?: Item;
};

export type Purchase = {
  id: string;
  supplierId: string;
  invoiceNo: string | null;
  status: "DRAFT" | "RECEIVED" | "CANCELLED";
  purchasedAt: string;
  receivedAt: string | null;
  subTotal: string;
  discount: string;
  total: string;
  supplier?: Supplier;
  lines?: PurchaseLine[];
};

export type RepairService = {
  id: string;
  name: string;
  defaultPrice: string;
  defaultDurationMin: number | null;
  active: boolean;
  createdAt: string;
};

export type ServiceLine = {
  id: string;
  repairServiceId?: string | null;
  repairService?: RepairService | null;
  description: string;
  qty: number;
  price: string;
};
export type ServicePart = {
  id: string;
  itemId: string;
  qty: number;
  unitPrice: string;
  item?: Item;
};


export type ServiceStatusHistory = {
  id: string;
  serviceOrderId: string;
  status: "RECEIVED" | "CLEANING" | "REPAIRING" | "READY" | "DELIVERED" | "CANCELLED";
  note: string | null;
  changedAt: string;
  changedByUserId: string | null;
  changedByUser?: { id: string; username: string } | null;
};
export type Payment = {
  id: string;
  serviceOrderId: string | null;
  amount: string;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  paidAt: string;
  note: string | null;
  receivedByUserId?: string | null;
  receivedBy?: { id: string; username: string } | null;
  serviceOrder?: { id: string; code: string; customer?: Customer } | null;
};


export type AuditLog = {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metaJson: string | null;
  createdAt: string;
  user?: { id: string; username: string } | null;
};

export type ServiceOrder = {
  id: string;
  code: string;
  vetCode: string | null;
  customerId: string;
  assignedStaffId: string | null;
  status: "RECEIVED" | "CLEANING" | "REPAIRING" | "READY" | "DELIVERED" | "CANCELLED";
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  shoeBrand: string | null;
  shoeColor: string | null;
  shoeSize: string | null;
  shoeType: string | null;
  pairCount: number;
  urgent: boolean;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  problemDesc: string | null;
  receivedAt: string;
  promisedAt: string | null;
  subTotal: string;
  discount: string;
  total: string;
  customer?: Customer;
  assignedStaff?: Staff | null;
  lines?: ServiceLine[];
  parts?: ServicePart[];
  payments?: Payment[];
  history?: ServiceStatusHistory[];
};

export type OtherIncome = {
  id: string;
  title: string;
  amount: string;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  receivedAt: string;
  note: string | null;
};

export type Expense = {
  id: string;
  title: string;
  amount: string;
  paidAt: string;
  note: string | null;
};

export type DashboardSummary = {
  counts: {
    items: number;
    customers: number;
    suppliers: number;
    staff: number;
    users: number;
    purchases: number;
    serviceOrders: number;
  };
  kpis: {
    paymentsToday: string;
    otherIncomeToday: string;
    expensesToday: string;

    // Added for enterprise dashboard (non-breaking additions)
    deliveredTodayCount?: number;
    deliveredTodayRevenue?: string;
    unpaidCount?: number;
    unpaidTotal?: string;
  };
  repair?: {
    statusCounts: Record<string, number>;
    overdueRepairs: number;
  };
  recentOrders?: {
    id: string;
    code: string;
    status: ServiceOrder["status"];
    paymentStatus: ServiceOrder["paymentStatus"];
    receivedAt: string;
    promisedAt: string | null;
    customer: { id: string; name: string; phone: string | null } | null;
    total: string;
    paid: string;
    balance: string;
  }[];
  generatedAt: string;
};

// Phase 2: Reports + Customer history
export type ReportSummary = {
  range: { start: string; end: string; mode: "today" | "week" | "month" | "custom" };
  kpis: {
    ordersReceived: number;
    ordersDelivered: number;
    netPayments: string;
    grossPayments: string;
    refunds: string;
    unpaidCount: number;
    unpaidTotal: string;
  };
  topServices: { description: string; qty: number; revenue: string }[];
  unpaid: {
    id: string;
    code: string;
    status: string;
    receivedAt: string;
    customer: { id: string; name: string; phone: string | null };
    total: string;
    paid: string;
    balance: string;
  }[];
  generatedAt: string;
};

export type CashierReport = {
  range: { start: string; end: string; mode: "today" | "week" | "month" | "custom" };
  kpis: {
    paymentCount: number;
    ticketsWithPayments: number;
    paymentsNet: string;
    paymentsGross: string;
    refunds: string; // negative
    otherIncome: string;
    expenses: string;
    netCash: string;
  };
  byMethod: {
    method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
    paymentsNet: string;
    paymentsGross: string;
    paymentsRefunds: string; // negative
    otherIncome: string;
    inflowNet: string;
  }[];
  generatedAt: string;
};

export type CustomerOverview = {
  customer: Customer;
  stats: {
    tickets: number;
    totalSpent: string;
    totalPaid: string;
    outstanding: string;
    lastVisit: string | null;
    repeatCustomer: boolean;
  };
  recentOrders: {
    id: string;
    code: string;
    status: ServiceOrder["status"];
    paymentStatus: ServiceOrder["paymentStatus"];
    receivedAt: string;
    promisedAt: string | null;
    total: string;
    paid: string;
    balance: string;
  }[];
};
