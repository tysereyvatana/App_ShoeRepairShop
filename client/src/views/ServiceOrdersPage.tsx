import React from "react";
import {
  Box,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  Alert,
  Autocomplete,
  CircularProgress,
  MenuItem,
  Divider,
  Typography,
  Chip,
  FormControlLabel,
  Switch,
  Tabs,
  Tab,
  IconButton,
  Menu,
  ButtonGroup,
  Stack,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AuditLog, Customer, Item, Paged, Payment, RepairService, ServiceOrder, Staff } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { fmtDate, fmtMoney } from "../lib/format";
import {
  MONEY_DECIMALS,
  clampMinorNonNegative,
  lineTotalMinor,
  minorToMajorString,
  moneyTextInputProps,
  normalizeMoneyInput,
  sanitizeMoneyInput,
  toMajorNumber,
  toMinor,
} from "../lib/money";
import { datetimeLocalToISO, isoToDatetimeLocal } from "../lib/datetime";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type CreateForm = {
  customerId: string;
  assignedStaffId: string;
  shoeBrand: string;
  shoeColor: string;
  shoeSize: string;
  shoeType: string;
  pairCount: number;
  urgent: boolean;
  problemDesc: string;
  promisedAt: string;
  vetCode: string;

  // Deposit at intake (optional)
  depositAmount: string;
  depositMethod: Payment["method"];
  depositNote: string;
};

type CreateLine = {
  id: string;
  repairServiceId: string | null;
  description: string;
  qty: number;
  price: number;
};

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const normalizePhone = (v?: string | null) => (v ?? "").replace(/\D/g, "");

const emptyCreate: CreateForm = {
  customerId: "",
  assignedStaffId: "",
  shoeBrand: "",
  shoeColor: "",
  shoeSize: "",
  shoeType: "",
  pairCount: 1,
  urgent: false,
  problemDesc: "",
  promisedAt: "",
  vetCode: "",

  depositAmount: "0",
  depositMethod: "CASH",
  depositNote: "",
};

function StatusChip({ status }: { status: ServiceOrder["status"] }) {
  const map: Record<string, { label: string; color: any }> = {
    RECEIVED: { label: "RECEIVED", color: "info" },
    CLEANING: { label: "CLEANING", color: "warning" },
    REPAIRING: { label: "REPAIRING", color: "warning" },
    READY: { label: "READY", color: "success" },
    DELIVERED: { label: "DELIVERED", color: "success" },
    CANCELLED: { label: "CANCELLED", color: "error" },
  };
  const x = map[status] ?? { label: status, color: "default" };
  return <Chip size="small" label={x.label} color={x.color} />;
}

function PayChip({ status }: { status: ServiceOrder["paymentStatus"] }) {
  const map: Record<string, { label: string; color: any }> = {
    UNPAID: { label: "UNPAID", color: "default" },
    PARTIAL: { label: "PARTIAL", color: "warning" },
    PAID: { label: "PAID", color: "success" },
  };
  const x = map[status] ?? { label: status, color: "default" };
  return <Chip size="small" label={x.label} color={x.color} />;
}

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  if (value !== index) return null;
  return <Box sx={{ pt: 2 }}>{children}</Box>;
}


export function ServiceOrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const detailTabKey = React.useMemo(() => `service-order-detail-tab:${user?.id ?? "anon"}`, [user?.id]);

  const [detailSearch, setDetailSearch] = React.useState("");
  const [confirm, setConfirm] = React.useState<
    | null
    | {
        title: string;
        message: React.ReactNode;
        confirmText: string;
        confirmColor?: "error" | "primary" | "success" | "warning" | "info";
        onConfirm: () => void;
      }
  >(null);

  const createPrintTagRef = React.useRef(false);
  const createPrintWindowRef = React.useRef<Window | null>(null);

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTab, setCreateTab] = React.useState(0);
  const [createForm, setCreateForm] = React.useState<CreateForm>(emptyCreate);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Initial services at intake (optional)
  const [createLines, setCreateLines] = React.useState<CreateLine[]>([]);
  const [createLineServiceId, setCreateLineServiceId] = React.useState<string>("");
  const [createLineDesc, setCreateLineDesc] = React.useState<string>("");
  const [createLineQty, setCreateLineQty] = React.useState<number>(1);
  const [createLinePrice, setCreateLinePrice] = React.useState<string>("0");

  const createServicesTotalMinor = React.useMemo(() => {
    return createLines.reduce((sum, l) => sum + lineTotalMinor(l.price, l.qty), 0);
  }, [createLines]);

  const createServicesTotal = React.useMemo(() => toMajorNumber(createServicesTotalMinor), [createServicesTotalMinor]);

  // Customer picker (from Customer Information)
  const [customerPickInput, setCustomerPickInput] = React.useState("");
  const [customerPickValue, setCustomerPickValue] = React.useState<Customer | null>(null);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detailTab, setDetailTab] = React.useState(0);
  const [printAnchorEl, setPrintAnchorEl] = React.useState<null | HTMLElement>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const closingDetailRef = React.useRef(false);

  // Allow deep-linking: /service-orders?open=<id>
  React.useEffect(() => {
    const open = searchParams.get("open");
    if (!open) {
      if (closingDetailRef.current) closingDetailRef.current = false;
      return;
    }
    if (closingDetailRef.current) return;
    if (open !== detailId) setDetailId(open);
  }, [searchParams, detailId]);

  const openDetail = React.useCallback(
    (id: string) => {
      const raw = localStorage.getItem(detailTabKey);
      const saved = raw ? Number(raw) : 0;
      const nextTab = Number.isFinite(saved) && saved >= 0 && saved <= 4 ? saved : 0;
      setDetailTab(nextTab);
      setDetailSearch("");
      setDetailId(id);
      const next = new URLSearchParams(searchParams);
      next.set("open", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, detailTabKey]
  );

  const closeDetail = React.useCallback(() => {
    closingDetailRef.current = true;
    setDetailId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;

  const ordersQ = useQuery({
    queryKey: ["service-orders", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<ServiceOrder>>("/service-orders", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const customersQ = useQuery({
    queryKey: ["customers", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Customer>>("/customers", { params: { q: "", page: 1, pageSize: 2000 } });
      return res.data.data;
    },
  });

  // Customer picker list for create dialog (searches by name/phone)
  const customerPickEnabled = createOpen && customerPickInput.trim().length > 0;

  const customerPickQ = useQuery({
    queryKey: ["customers", "pick", customerPickInput],
    enabled: customerPickEnabled,
    queryFn: async () => {
      const res = await api.get<Paged<Customer>>("/customers", { params: { q: customerPickInput, page: 1, pageSize: 50 } });
      return res.data.data;
    },
  });

  const customerOptions = React.useMemo(() => {
    // Robust fallback: when input is empty, show all customers from Customer Information
    // (prevents empty dropdown due to search query/caching issues)
    const base = customerPickEnabled ? (customerPickQ.data ?? []) : (customersQ.data ?? []);
    // De-dupe by id
    const seen = new Set<string>();
    const out: Customer[] = [];
    for (const c of base) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  }, [customerPickEnabled, customerPickQ.data, customersQ.data]);

  // React.useEffect(() => {
  //   if (!createOpen) return;
  //   if (createForm.customerId) return;
  //   const all = customersQ.data ?? [];
  //   const walkIn = all.find((c) => /walk[- ]?in/i.test(c.name));
  //   if (walkIn) {
  //     setCustomerPickValue(walkIn);
  //     setCreateForm((f) => ({ ...f, customerId: walkIn.id }));
  //   }
  // }, [createOpen, createForm.customerId, customersQ.data]);

  const staffQ = useQuery({
    queryKey: ["staff", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Staff>>("/staff", { params: { q: "", page: 1, pageSize: 200 } });
      return res.data.data;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["items", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Item>>("/items", { params: { q: "", page: 1, pageSize: 1000 } });
      return res.data.data;
    },
  });

  const repairServicesQ = useQuery({
    queryKey: ["repair-services", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<RepairService>>("/repair-services", { params: { q: "", page: 1, pageSize: 2000 } });
      return res.data.data;
    },
  });

  const detailQ = useQuery({
    queryKey: ["service-order", detailId],
    enabled: !!detailId,
    queryFn: async () => {
      const res = await api.get<ServiceOrder>(`/service-orders/${detailId}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });


const auditQ = useQuery({
  queryKey: ["service-order-audit", detailId],
  enabled: !!detailId,
  queryFn: async () => {
    const res = await api.get<AuditLog[]>(`/service-orders/${detailId}/audit`);
    return res.data;
  },
  placeholderData: (prev) => prev,
  staleTime: 5_000,
});

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId: createForm.customerId,
        assignedStaffId: createForm.assignedStaffId || null,
        shoeBrand: createForm.shoeBrand || null,
        shoeColor: createForm.shoeColor || null,
        shoeSize: createForm.shoeSize || null,
        shoeType: createForm.shoeType || null,
        pairCount: createForm.pairCount,
        urgent: createForm.urgent,
        problemDesc: createForm.problemDesc || null,
        promisedAt: createForm.promisedAt ? datetimeLocalToISO(createForm.promisedAt) : null,
        vetCode: createForm.vetCode ? createForm.vetCode.trim() : null,

        lines: createLines.map((l) => ({
          repairServiceId: l.repairServiceId,
          description: l.description,
          qty: l.qty,
          price: l.price,
        })),

        // deposit (optional)
        depositAmount: toMajorNumber(toMinor(createForm.depositAmount ?? "0")),
        depositMethod: createForm.depositMethod ?? "CASH",
        depositNote: createForm.depositNote ? createForm.depositNote : null,
      };
      const res = await api.post<ServiceOrder>("/service-orders", payload);
      return res.data;
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      setCreateLines([]);
      setCreateLineServiceId("");
      setCreateLineDesc("");
      setCreateLineQty(1);
      setCreateLinePrice("0");
      openDetail(created.id);

      if (createPrintTagRef.current) {
        createPrintTagRef.current = false;
        const w = createPrintWindowRef.current;
        createPrintWindowRef.current = null;
        const url = `/print/tag/${created.id}`;
        if (w && !w.closed) w.location.href = url;
        else window.open(url, "_blank");
      }
    },
    onError: (e: any) => setCreateError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateHeaderMut = useMutation({
    mutationFn: async (payload: any) => {
      if (!detailId) throw new Error("No id");
      const res = await api.put<ServiceOrder>(`/service-orders/${detailId}`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Update failed"),
  });

  const addLineMut = useMutation({
    mutationFn: async (payload: { repairServiceId?: string | null; description?: string | null; qty: number; price?: number | null }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/lines`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Add line failed"),
  });

  const delLineMut = useMutation({
    mutationFn: async (lineId: string) => api.delete(`/service-lines/${lineId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Delete line failed"),
  });

  const addPartMut = useMutation({
    mutationFn: async (payload: { itemId: string; qty: number; unitPrice: number }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/parts`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Add part failed"),
  });

  const delPartMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/service-parts/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Delete part failed"),
  });

  const statusMut = useMutation({
    mutationFn: async (payload: { status: ServiceOrder["status"]; note?: string | null }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/status`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Status update failed"),
  });

  const paymentMut = useMutation({
    mutationFn: async (payload: { amount: number; method: Payment["method"]; note?: string | null }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/payments`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Payment failed"),
  });


  const refundMut = useMutation({
    mutationFn: async (payload: { paymentId: string; amount?: number; reason: string }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/payments/${payload.paymentId}/refund`, {
        amount: payload.amount,
        reason: payload.reason,
      });
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Refund failed"),
  });

  const readyMut = useMutation({
    mutationFn: async (payload: { discount?: number }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/ready`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      setDiscountTouched(false);
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Mark READY failed"),
  });

  const discountMut = useMutation({
    mutationFn: async (payload: { discount: number }) => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/discount`, payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      setDiscountTouched(false);
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Discount update failed"),
  });

  const deliverMut = useMutation({
    mutationFn: async () => {
      if (!detailId) throw new Error("No id");
      const res = await api.post(`/service-orders/${detailId}/deliver`, { note: null });
      return res.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-order", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-order-audit", detailId] });
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (e: any) => setDetailError(e?.response?.data?.message ?? "Deliver failed"),
  });

  const columns: GridColDef<ServiceOrder>[] = [
    { field: "code", headerName: "Code", width: 180 },
    { field: "customer", headerName: "Customer", flex: 1, minWidth: 200, valueGetter: (v, r) => r.customer?.name ?? "" },
    {
      field: "shoe",
      headerName: "Shoe",
      width: 260,
      valueGetter: (v, r) => [r.shoeBrand, r.shoeType, r.shoeSize, r.shoeColor].filter(Boolean).join(" • "),
    },
    { field: "status", headerName: "Status", width: 140, renderCell: (p) => <StatusChip status={p.row.status} /> },
    { field: "paymentStatus", headerName: "Payment", width: 140, renderCell: (p) => <PayChip status={p.row.paymentStatus} /> },
    { field: "total", headerName: "Total", width: 120, valueGetter: (v, r) => fmtMoney(r.total) },
    { field: "receivedAt", headerName: "Received", width: 190, valueGetter: (v, r) => fmtDate(r.receivedAt) },
    { field: "promisedAt", headerName: "Promised", width: 190, valueGetter: (v, r) => (r.promisedAt ? fmtDate(r.promisedAt) : "") },
  ];

  const openCreate = () => {
    setCreateTab(0);
    setCreateError(null);
    setCreateForm(emptyCreate);
    setCustomerPickInput("");
    setCustomerPickValue(null);

    setCreateLines([]);
    setCreateLineServiceId("");
    setCreateLineDesc("");
    setCreateLineQty(1);
    setCreateLinePrice("0");

    setCreateOpen(true);
  };

  const saveCreate = (opts?: { printTag?: boolean }) => {
    setCreateError(null);
    if (!createForm.customerId) {
      setCreateError("Customer is required");
      return;
    }
    if (toMinor(createForm.depositAmount ?? "0") < 0) {
      setCreateError("Deposit amount must be 0 or greater");
      return;
    }
    const wantsPrint = !!opts?.printTag;
    createPrintTagRef.current = wantsPrint;
    createPrintWindowRef.current = null;
    if (wantsPrint) {
      // Open the window synchronously to avoid pop-up blocking.
      try {
        createPrintWindowRef.current = window.open("about:blank", "_blank");
      } catch {
        createPrintWindowRef.current = null;
      }
    }
    createMut.mutate();
  };

  // detail inline forms
  const [lineServiceId, setLineServiceId] = React.useState("");
  const [lineDesc, setLineDesc] = React.useState("");
  const [lineQty, setLineQty] = React.useState(1);
  const [linePrice, setLinePrice] = React.useState<string>("0");

  const [partItemId, setPartItemId] = React.useState("");
  const [partQty, setPartQty] = React.useState(1);
  const [partPrice, setPartPrice] = React.useState<string>("0");

  const [payAmount, setPayAmount] = React.useState<string>("");
  const [payMethod, setPayMethod] = React.useState<Payment["method"]>("CASH");
  const [payNote, setPayNote] = React.useState("");

  const [statusNote, setStatusNote] = React.useState("");

  // Refund dialog
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundPayment, setRefundPayment] = React.useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = React.useState<string>("");
  const [refundReason, setRefundReason] = React.useState("");


  const payAmountMinor = React.useMemo(() => toMinor(payAmount), [payAmount]);
  const canAddPayment = payAmountMinor > 0;

  const addPayment = React.useCallback(() => {
    if (!canAddPayment) return;
    setDetailError(null);
    paymentMut.mutate({ amount: toMajorNumber(payAmountMinor), method: payMethod, note: payNote ? payNote : null });
    setPayAmount("");
    setPayNote("");
  }, [canAddPayment, payAmountMinor, payMethod, payNote, paymentMut]);

  const [closeDiscount, setCloseDiscount] = React.useState<string>("0");
  const [discountTouched, setDiscountTouched] = React.useState(false);

  const order = detailQ.data;

  React.useEffect(() => {
    if (!detailId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!detailId) return;
      // Shortcuts only in the Ticket Details dialog
      if (detailTab !== 3) return; // Payments tab

      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        addPayment();
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const k = e.key;
        if (k >= "1" && k <= "5") {
          const idx = Number(k) - 1;
          const quick = [1000, 2000, 5000, 10000, 20000];
          setPayAmount(String(quick[idx] ?? 0));
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailId, detailTab, addPayment]);

  // Keep discount input in sync with the order (unless user is currently editing)
  React.useEffect(() => {
    if (!order) return;
    if (discountTouched) return;
    setCloseDiscount(minorToMajorString(toMinor((order as any).discount ?? 0)));
  }, [detailId, order?.discount, discountTouched]);

  const paidTotalMinor = React.useMemo(() => {
    return (order?.payments ?? []).reduce((s, p) => s + toMinor(p.amount), 0);
  }, [order?.payments]);

  const orderTotalMinor = React.useMemo(() => toMinor(order?.total ?? 0), [order?.total]);
  const balanceMinor = React.useMemo(() => orderTotalMinor - paidTotalMinor, [orderTotalMinor, paidTotalMinor]);

  const paidTotal = React.useMemo(() => toMajorNumber(paidTotalMinor), [paidTotalMinor]);
  const orderTotal = React.useMemo(() => toMajorNumber(orderTotalMinor), [orderTotalMinor]);
  const balance = React.useMemo(() => toMajorNumber(balanceMinor), [balanceMinor]);

  const statusLocked = React.useMemo(() => {
    if (!order) return false;
    return ["DELIVERED", "CANCELLED"].includes(order.status);
  }, [order?.status]);

  const timelineItems = React.useMemo(() => {
    const items: Array<{ id: string; at: number; type: "STATUS" | "PAYMENT" | "REFUND" | "AUDIT"; title: string; subtitle: string }> = [];

    (order?.history ?? []).forEach((h) => {
      items.push({
        id: `h_${h.id}`,
        at: new Date(h.changedAt).getTime(),
        type: "STATUS",
        title: `Status → ${h.status}`,
        subtitle: `${fmtDate(h.changedAt)}${h.changedByUser?.username ? ` • ${h.changedByUser.username}` : ""}${h.note ? ` • ${h.note}` : ""}`,
      });
    });

    (order?.payments ?? []).forEach((p) => {
      const amtMinor = toMinor(p.amount);
      const isRefund = amtMinor < 0;
      const amt = minorToMajorString(amtMinor);
      items.push({
        id: `p_${p.id}`,
        at: new Date(p.paidAt).getTime(),
        type: isRefund ? "REFUND" : "PAYMENT",
        title: isRefund ? `Refund ${fmtMoney(amt)}` : `Payment ${fmtMoney(amt)}`,
        subtitle: `${fmtDate(p.paidAt)} • ${p.method}${p.receivedBy?.username ? ` • ${p.receivedBy.username}` : ""}${p.note ? ` • ${p.note}` : ""}`,
      });
    });

(auditQ.data ?? []).forEach((a) => {
  const at = new Date(a.createdAt).getTime();
  let meta: any = null;
  try {
    meta = a.metaJson ? JSON.parse(a.metaJson) : null;
  } catch {
    meta = null;
  }

  const moneyFromMinor = (v: any) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return fmtMoney(minorToMajorString(n));
  };

  const titleFromAction = () => {
    switch (a.action) {
      case "SERVICE_ORDER_CREATE":
        return "Ticket created";
      case "SERVICE_ORDER_UPDATE":
        return "Ticket updated";
      case "SERVICE_ORDER_LINE_ADD":
        return `Service added${meta?.description ? `: ${meta.description}` : ""}`;
      case "SERVICE_ORDER_LINE_DELETE":
        return "Service removed";
      case "SERVICE_ORDER_PART_ADD":
        return "Part added";
      case "SERVICE_ORDER_PART_DELETE":
        return "Part removed";
      case "SERVICE_ORDER_DEPOSIT":
        return `Deposit ${meta?.amountMinor != null ? moneyFromMinor(meta.amountMinor) : ""}`.trim();
      case "SERVICE_ORDER_PAYMENT_ADD":
        return `Payment ${meta?.amountMinor != null ? moneyFromMinor(meta.amountMinor) : ""}`.trim();
      case "SERVICE_ORDER_PAYMENT_REFUND":
        return `Refund ${meta?.refundMinor != null ? moneyFromMinor(-Math.abs(Number(meta.refundMinor))) : ""}`.trim();
      case "SERVICE_ORDER_DISCOUNT_UPDATE":
        return `Discount set${meta?.discountMinor != null ? `: ${moneyFromMinor(meta.discountMinor)}` : ""}`;
      case "SERVICE_ORDER_MARK_READY":
        return "Marked as ready";
      case "SERVICE_ORDER_DELIVER":
        return "Delivered";
      case "SERVICE_ORDER_STATUS_SET":
        return `Status set${meta?.status ? `: ${meta.status}` : ""}`;
      default:
        return a.action;
    }
  };

  const metaSuffixParts: string[] = [];
  if (meta?.qty != null) metaSuffixParts.push(`qty ${meta.qty}`);
  if (meta?.priceMinor != null) metaSuffixParts.push(`price ${moneyFromMinor(meta.priceMinor)}`);
  if (meta?.unitPriceMinor != null) metaSuffixParts.push(`unit ${moneyFromMinor(meta.unitPriceMinor)}`);
  if (meta?.method) metaSuffixParts.push(String(meta.method));
  if (meta?.note) metaSuffixParts.push(String(meta.note));
  if (meta?.changedFields?.length) metaSuffixParts.push(`fields: ${meta.changedFields.join(", ")}`);

  items.push({
    id: `a_${a.id}`,
    at,
    type: "AUDIT",
    title: titleFromAction(),
    subtitle: `${fmtDate(a.createdAt)}${a.user?.username ? ` • ${a.user.username}` : ""}${metaSuffixParts.length ? ` • ${metaSuffixParts.join(" • ")}` : ""}`,
  });
});


    items.sort((a, b) => b.at - a.at);
    return items;
  }, [order?.history, order?.payments, auditQ.data]);

  const detailSearchNorm = React.useMemo(() => detailSearch.trim().toLowerCase(), [detailSearch]);

  const filteredLines = React.useMemo(() => {
    const arr = order?.lines ?? [];
    if (!detailSearchNorm) return arr;
    return arr.filter((l) => `${l.description} ${l.repairService?.name ?? ""}`.toLowerCase().includes(detailSearchNorm));
  }, [order?.lines, detailSearchNorm]);

  const filteredParts = React.useMemo(() => {
    const arr = order?.parts ?? [];
    if (!detailSearchNorm) return arr;
    return arr.filter((p) => `${p.item?.name ?? ""} ${p.itemId}`.toLowerCase().includes(detailSearchNorm));
  }, [order?.parts, detailSearchNorm]);

  const filteredPayments = React.useMemo(() => {
    const arr = order?.payments ?? [];
    if (!detailSearchNorm) return arr;
    return arr.filter((p) => `${p.method} ${p.note ?? ""} ${p.amount}`.toLowerCase().includes(detailSearchNorm));
  }, [order?.payments, detailSearchNorm]);

  const filteredTimeline = React.useMemo(() => {
    if (!detailSearchNorm) return timelineItems;
    return timelineItems.filter((it) => `${it.type} ${it.title} ${it.subtitle}`.toLowerCase().includes(detailSearchNorm));
  }, [timelineItems, detailSearchNorm]);

  React.useEffect(() => {
    // reset detail forms when switching order
    const raw = localStorage.getItem(detailTabKey);
    const saved = raw ? Number(raw) : 0;
    setDetailTab(Number.isFinite(saved) && saved >= 0 && saved <= 4 ? saved : 0);
    setDetailSearch("");
    setPrintAnchorEl(null);
    setDetailError(null);
    setLineServiceId("");
    setLineDesc("");
    setLineQty(1);
    setLinePrice("0");
    setPartItemId("");
    setPartQty(1);
    setPartPrice("0");
    setPayAmount("");
    setPayMethod("CASH");
    setPayNote("");
    setStatusNote("");
    setRefundOpen(false);
    setRefundPayment(null);
    setRefundAmount("");
    setRefundReason("");
    setCloseDiscount("0");
    setDiscountTouched(false);
  }, [detailId, detailTabKey]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Repair Tickets"
        subtitle="Track shoe repairs: services, materials, payments, and workflow statuses."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Repair Ticket"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 520 }}>
            <DataGrid
              rows={ordersQ.data?.data ?? []}
              columns={columns}
              loading={ordersQ.isLoading || ordersQ.isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              onRowDoubleClick={(p) => openDetail(p.row.id)}
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={ordersQ.data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

            {/* Create */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        PaperProps={{
          sx: {
            // Match Repair Ticket Details size so the wizard feels consistent.
            height: { xs: "92vh", md: 760 },
            maxHeight: { xs: "92vh", md: 760 },
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography fontWeight={900}>New Repair Ticket</Typography>
            <IconButton onClick={() => setCreateOpen(false)} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Box sx={{ px: 3, pb: 1 }}>
          <Tabs value={createTab} onChange={(_, v) => setCreateTab(v)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label="Details" />
            <Tab label="Services" />
            <Tab label="Deposit" />
            <Tab label="Review" />
          </Tabs>
        </Box>

        <DialogContent dividers sx={{ bgcolor: "grey.50", flex: 1, minHeight: 0 }}>
          {createError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          ) : null}

          {(customersQ.isError || customerPickQ.isError) ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Failed to load customers. Please make sure you are logged in, then refresh the page.
            </Alert>
          ) : null}

          {staffQ.isError ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Failed to load staff. Please make sure you are logged in, then refresh the page.
            </Alert>
          ) : null}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, alignItems: "start" }}>
            <Box>
              <TabPanel value={createTab} index={0}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography fontWeight={900}>Customer & Ticket</Typography>

                    <Autocomplete
                      options={customerOptions}
                      loading={customersQ.isLoading || customerPickQ.isLoading}
                      openOnFocus
                      value={customerPickValue}
                      onChange={(_, val) => {
                        setCustomerPickValue(val);
                        setCreateForm({ ...createForm, customerId: val?.id ?? "" });
                      }}
                      inputValue={customerPickInput}
                      onInputChange={(_, val, reason) => {
                        setCustomerPickInput(val);
                        if (reason === "input") {
                          const digits = normalizePhone(val);
                          if (digits.length >= 6) {
                            const all = customersQ.data ?? [];
                            const matches = all.filter((c) => normalizePhone(c.phone) === digits);
                            if (matches.length === 1) {
                              const m = matches[0];
                              setCustomerPickValue(m);
                              setCreateForm((f) => ({ ...f, customerId: m.id }));
                            }
                          }
                        }
                      }}
                      getOptionLabel={(c) => `${c.name}${c.phone ? ` • ${c.phone}` : ""}`}
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          label="Customer"
                          placeholder="Search by name / phone"
                          helperText={
                            (customerOptions ?? []).length === 0 && !(customersQ.isLoading || customerPickQ.isLoading)
                              ? "No customers found. Please create customers in Customer Information."
                              : ""
                          }
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {(customersQ.isLoading || customerPickQ.isLoading) ? <CircularProgress size={18} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />

                    {customerPickValue ? (
                      <Box sx={{ mt: -1, color: "text.secondary" }}>
                        <Typography variant="caption">
                          {customerPickValue.phone ? `Phone: ${customerPickValue.phone}` : "No phone"}{" "}
                          {customerPickValue.address ? ` • Address: ${customerPickValue.address}` : ""}
                        </Typography>
                      </Box>
                    ) : null}

                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          setCreateOpen(false);
                          navigate("/customers");
                        }}
                      >
                        Manage customers
                      </Button>
                    </Box>

                    <Autocomplete
                      options={staffQ.data ?? []}
                      loading={staffQ.isLoading}
                      openOnFocus
                      value={(staffQ.data ?? []).find((s) => s.id === createForm.assignedStaffId) ?? null}
                      onChange={(_, val) => setCreateForm({ ...createForm, assignedStaffId: val?.id ?? "" })}
                      getOptionLabel={(s) => `${s.name}${s.position ? ` • ${s.position}` : ""}`}
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          label="Assigned Staff (optional)"
                          placeholder="Select staff (optional)"
                          helperText={
                            (staffQ.data ?? []).length === 0 && !staffQ.isLoading
                              ? "No staff found. Please create staff in Staff Information."
                              : "Leave empty if not assigned yet."
                          }
                        />
                      )}
                    />

                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          setCreateOpen(false);
                          navigate("/staff");
                        }}
                      >
                        Manage staff
                      </Button>
                    </Box>

                    <Divider />

                    <Typography fontWeight={900}>Shoe details</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                      <TextField size="small" label="Shoe Brand" value={createForm.shoeBrand} onChange={(e) => setCreateForm({ ...createForm, shoeBrand: e.target.value })} />
                      <TextField size="small" label="Shoe Type" value={createForm.shoeType} onChange={(e) => setCreateForm({ ...createForm, shoeType: e.target.value })} />
                      <TextField size="small" label="Shoe Size" value={createForm.shoeSize} onChange={(e) => setCreateForm({ ...createForm, shoeSize: e.target.value })} />
                      <TextField size="small" label="Shoe Color" value={createForm.shoeColor} onChange={(e) => setCreateForm({ ...createForm, shoeColor: e.target.value })} />
                      <TextField
                        size="small"
                        label="Pair Count"
                        type="number"
                        value={createForm.pairCount}
                        onChange={(e) => setCreateForm({ ...createForm, pairCount: Number(e.target.value) })}
                      />
                      <FormControlLabel
                        control={<Switch checked={createForm.urgent} onChange={(e) => setCreateForm({ ...createForm, urgent: e.target.checked })} />}
                        label="Urgent"
                      />
                    </Box>

                    <TextField size="small" label="Problem Description" multiline minRows={2} value={createForm.problemDesc} onChange={(e) => setCreateForm({ ...createForm, problemDesc: e.target.value })} />

                    <TextField
                      size="small"
                      label="Promised At (optional)"
                      type="datetime-local"
                      value={createForm.promisedAt}
                      onChange={(e) => setCreateForm({ ...createForm, promisedAt: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />

                    <TextField
                      size="small"
                      label="VET Code (optional)"
                      value={createForm.vetCode}
                      onChange={(e) => setCreateForm({ ...createForm, vetCode: e.target.value })}
                      placeholder="e.g. 15 66 97 88"
                    />
                  </CardContent>
                </Card>
              </TabPanel>

              <TabPanel value={createTab} index={1}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Box>
                      <Typography fontWeight={900}>Services</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Add services now (faster intake) or later inside ticket details.
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "2fr 3fr 1fr 1fr auto" },
                        gap: 1.5,
                        alignItems: "center",
                      }}
                    >
                      <TextField
                        size="small"
                        select
                        label="Catalog"
                        value={createLineServiceId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setCreateLineServiceId(id);
                          if (!id) return;
                          const svc = (repairServicesQ.data ?? []).find((x) => x.id === id);
                          if (svc) {
                            setCreateLineDesc(svc.name);
                            setCreateLinePrice(normalizeMoneyInput(String(svc.defaultPrice ?? 0), { emptyAsZero: true }));
                          }
                        }}
                      >
                        <MenuItem value="">Custom</MenuItem>
                        {(repairServicesQ.data ?? [])
                          .filter((x) => x.active)
                          .map((svc) => (
                            <MenuItem key={svc.id} value={svc.id}>
                              {svc.name} • {fmtMoney(svc.defaultPrice)}
                            </MenuItem>
                          ))}
                      </TextField>

                      <TextField
                        size="small"
                        label="Description"
                        value={createLineDesc}
                        onChange={(e) => setCreateLineDesc(e.target.value)}
                        placeholder="e.g. stitch repair"
                      />

                      <TextField
                        size="small"
                        label="Qty"
                        type="number"
                        value={createLineQty}
                        onChange={(e) => setCreateLineQty(Math.max(1, Number(e.target.value)))}
                        inputProps={{ min: 1 }}
                      />

                      <TextField
                        size="small"
                        label="Price"
                        value={createLinePrice}
                        onChange={(e) => setCreateLinePrice(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS))}
                        onBlur={() => setCreateLinePrice(normalizeMoneyInput(createLinePrice, { emptyAsZero: true }))}
                        inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                      />

                      <Button
                        variant="contained"
                        onClick={() => {
                          const svc = createLineServiceId ? (repairServicesQ.data ?? []).find((x) => x.id === createLineServiceId) : null;
                          const description = (createLineDesc || svc?.name || "").trim();
                          const qty = Math.max(1, Number(createLineQty || 1));
                          const priceSource = (createLinePrice || "").trim() ? createLinePrice : String(svc?.defaultPrice ?? 0);
                          const price = toMajorNumber(toMinor(priceSource));

                          if (!description) {
                            setCreateError("Service description required");
                            return;
                          }
                          if (!Number.isFinite(price) || price < 0) {
                            setCreateError("Price must be 0 or greater");
                            return;
                          }

                          setCreateLines((arr) => [
                            ...arr,
                            { id: newId(), repairServiceId: createLineServiceId ? createLineServiceId : null, description, qty, price },
                          ]);

                          setCreateLineServiceId("");
                          setCreateLineDesc("");
                          setCreateLineQty(1);
                          setCreateLinePrice("0");
                        }}
                      >
                        Add
                      </Button>
                    </Box>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Description</TableCell>
                            <TableCell width={90} align="right">
                              Qty
                            </TableCell>
                            <TableCell width={130} align="right">
                              Price
                            </TableCell>
                            <TableCell width={140} align="right">
                              Total
                            </TableCell>
                            <TableCell width={110} align="right">
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {createLines.length ? (
                            createLines.map((l) => (
                              <TableRow key={l.id}>
                                <TableCell>{l.description}</TableCell>
                                <TableCell align="right">{l.qty}</TableCell>
                                <TableCell align="right">{fmtMoney(l.price)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 900 }}>
                                  {fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}
                                </TableCell>
                                <TableCell align="right">
                                  <Button size="small" color="error" onClick={() => setCreateLines((arr) => arr.filter((x) => x.id !== l.id))}>
                                    Remove
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <Typography variant="body2" color="text.secondary">
                                  No services added yet.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </TabPanel>

              <TabPanel value={createTab} index={2}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Box>
                      <Typography fontWeight={900}>Deposit</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Optional. If customer pays now, enter a deposit.
                      </Typography>
                    </Box>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                      <TextField
                        size="small"
                        label="Deposit Amount"
                        value={createForm.depositAmount}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, depositAmount: sanitizeMoneyInput(e.target.value, MONEY_DECIMALS) })
                        }
                        onBlur={() =>
                          setCreateForm({ ...createForm, depositAmount: normalizeMoneyInput(createForm.depositAmount, { emptyAsZero: true }) })
                        }
                        inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                        helperText="Leave 0 if none."
                      />

                      <TextField
                        size="small"
                        select
                        label="Deposit Method"
                        value={createForm.depositMethod}
                        onChange={(e) => setCreateForm({ ...createForm, depositMethod: e.target.value as any })}
                        disabled={!(toMinor(createForm.depositAmount) > 0)}
                      >
                        <MenuItem value="CASH">Cash</MenuItem>
                        <MenuItem value="CARD">Card</MenuItem>
                        <MenuItem value="TRANSFER">Transfer</MenuItem>
                        <MenuItem value="OTHER">Other</MenuItem>
                      </TextField>
                    </Box>

                    <TextField
                      size="small"
                      label="Deposit Note (optional)"
                      value={createForm.depositNote}
                      onChange={(e) => setCreateForm({ ...createForm, depositNote: e.target.value })}
                      disabled={!(toMinor(createForm.depositAmount) > 0)}
                      placeholder="e.g. receipt #, note, etc"
                    />
                  </CardContent>
                </Card>
              </TabPanel>

              <TabPanel value={createTab} index={3}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography fontWeight={900}>Review</Typography>

                    <Typography variant="body2" color="text.secondary">
                      Check the summary on the right, then click <b>Create</b>.
                    </Typography>

                    {!createForm.customerId ? (
                      <Alert severity="info">Customer is required.</Alert>
                    ) : null}

                    {toMinor(createForm.depositAmount) > 0 ? (
                      <Alert severity="info">Deposit will be recorded as a payment on creation.</Alert>
                    ) : (
                      <Alert severity="info">No deposit entered (OK).</Alert>
                    )}
                  </CardContent>
                </Card>
              </TabPanel>
            </Box>

            {/* Summary (right side on md+) */}
            <Card
              variant="outlined"
              sx={{
                borderRadius: 2,
                position: { md: "sticky" as any },
                top: { md: 8 },
                height: "fit-content",
              }}
            >
              <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                <Typography fontWeight={900}>Summary</Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Customer
                  </Typography>
                  <Typography fontWeight={800}>{customerPickValue?.name || "—"}</Typography>
                  {customerPickValue?.phone ? (
                    <Typography variant="caption" color="text.secondary">
                      {customerPickValue.phone}
                      {customerPickValue.address ? ` • ${customerPickValue.address}` : ""}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Box>

                <Divider />

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Services
                  </Typography>
                  <Typography fontWeight={900}>{createLines.length}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Services Total
                  </Typography>
                  <Typography fontWeight={900}>{fmtMoney(createServicesTotal)}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Deposit
                  </Typography>
                  <Typography fontWeight={900}>{fmtMoney(createForm.depositAmount)}</Typography>
                </Box>

                <Divider />

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Estimated Total
                  </Typography>
                  <Typography fontWeight={900}>{fmtMoney(createServicesTotal)}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Urgent
                  </Typography>
                  <Typography fontWeight={800}>{createForm.urgent ? "Yes" : "No"}</Typography>
                </Box>

                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    Promised At
                  </Typography>
                  <Typography fontWeight={800}>{createForm.promisedAt ? createForm.promisedAt.replace("T", " ") : "—"}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            p: 2,
            position: "sticky",
            bottom: 0,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button variant="outlined" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={() => saveCreate({ printTag: true })}
            disabled={createMut.isPending}
          >
            Create & Print Tag
          </Button>
          <Button variant="contained" onClick={() => saveCreate()} disabled={createMut.isPending}>
            Create
          </Button>
        </DialogActions>
      </Dialog>


      {/* Detail */}
      <Dialog
        open={!!detailId}
        onClose={closeDetail}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        PaperProps={{
          sx: {
            // Fixed size so tab changes don't resize the dialog.
            height: { xs: "92vh", md: 760 },
            maxHeight: { xs: "92vh", md: 760 },
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography fontWeight={900}>Repair Ticket Details</Typography>
              {order?.code ? (
                <Typography color="text.secondary" fontWeight={700}>
                  {order.code}
                </Typography>
              ) : null}
            </Box>

            <IconButton onClick={closeDetail} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <Box sx={{ px: 3, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Tabs
            value={detailTab}
            onChange={(_, v) => {
              setDetailTab(v);
              try {
                localStorage.setItem(detailTabKey, String(v));
              } catch {
                // ignore storage failures (private browsing)
              }
            }}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab label="Overview" />
            <Tab label="Services" />
            <Tab label="Parts" />
            <Tab label="Payments" />
            <Tab label="Timeline" />
          </Tabs>

          {order ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography fontWeight={900}>Total: {fmtMoney(order.total)}</Typography>
              <StatusChip status={order.status} />
              <PayChip status={order.paymentStatus} />

              <TextField
                size="small"
                placeholder="Search in ticket…"
                value={detailSearch}
                onChange={(e) => setDetailSearch(e.target.value)}
                sx={{ minWidth: { xs: 160, sm: 220 } }}
              />

              <Button
                size="small"
                variant="outlined"
                startIcon={<PrintIcon />}
                endIcon={<ArrowDropDownIcon />}
                onClick={(e) => setPrintAnchorEl(e.currentTarget)}
              >
                Print
              </Button>

              <Menu anchorEl={printAnchorEl} open={!!printAnchorEl} onClose={() => setPrintAnchorEl(null)}>
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/tag/${order.id}`, "_blank");
                  }}
                >
                  Print Tag
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/tag/${order.id}?copies=2`, "_blank");
                  }}
                >
                  Print Tag (2 copies)
                </MenuItem>

                <Divider />
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/receipt/${order.id}`, "_blank");
                  }}
                >
                  Print Receipt
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/receipt-a5/${order.id}`, "_blank");
                  }}
                >
                  Print Receipt (A5)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/shipping/${order.id}`, "_blank");
                  }}
                >
                  Print Shipping
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/shipping/${order.id}?copies=2`, "_blank");
                  }}
                >
                  Print Shipping (2 copies)
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/vet/${order.id}`, "_blank");
                  }}
                >
                  VET Print
                </MenuItem>

                <Divider />
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    if (!order) return;
                    window.open(`/print/both/${order.id}`, "_blank");
                  }}
                >
                  Print Both
                </MenuItem>

                <Divider />
                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    window.open(`/print/tips`, "_blank");
                  }}
                >
                  Printer Tips
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    setPrintAnchorEl(null);
                    window.open(`/print/test`, "_blank");
                  }}
                >
                  Printer Test
                </MenuItem>
              </Menu>
            </Box>
          ) : null}
        </Box>

        <DialogContent dividers sx={{ bgcolor: "grey.50" }}>
          {detailError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {detailError}
            </Alert>
          ) : null}

          {detailQ.isLoading ? <Typography color="text.secondary">Loading...</Typography> : null}

          {order ? (
            <>
              {/* Overview */}
              <TabPanel value={detailTab} index={0}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 2, alignItems: "start" }}>
                  {/* Left: ticket / shoe details */}
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <Box>
                        <Typography fontWeight={900}>Ticket</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Customer: {order.customer?.name ?? "—"} • Received: {fmtDate(order.receivedAt)}
                        </Typography>
                      </Box>

                      <Divider />

                      <Typography fontWeight={900}>Header</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                        <TextField
                          size="small"
                          select
                          label="Customer"
                          value={order.customerId}
                          onChange={(e) => updateHeaderMut.mutate({ customerId: e.target.value })}
                        >
                          {(customersQ.data ?? []).map((c) => (
                            <MenuItem key={c.id} value={c.id}>
                              {c.name}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          size="small"
                          select
                          label="Assigned Staff"
                          value={order.assignedStaffId ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ assignedStaffId: e.target.value || null })}
                        >
                          <MenuItem value="">Unassigned</MenuItem>
                          {(staffQ.data ?? []).map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          size="small"
                          label="Shoe Brand"
                          value={order.shoeBrand ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ shoeBrand: e.target.value || null })}
                        />

                        <TextField
                          size="small"
                          label="Shoe Type"
                          value={order.shoeType ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ shoeType: e.target.value || null })}
                        />

                        <TextField
                          size="small"
                          label="Shoe Size"
                          value={order.shoeSize ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ shoeSize: e.target.value || null })}
                        />

                        <TextField
                          size="small"
                          label="Shoe Color"
                          value={order.shoeColor ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ shoeColor: e.target.value || null })}
                        />

                        <TextField
                          size="small"
                          label="Pair Count"
                          type="number"
                          value={order.pairCount}
                          onChange={(e) => updateHeaderMut.mutate({ pairCount: Number(e.target.value) })}
                        />

                        <FormControlLabel
                          control={<Switch checked={order.urgent} onChange={(e) => updateHeaderMut.mutate({ urgent: e.target.checked })} />}
                          label="Urgent"
                        />

                        <TextField
                          size="small"
                          label="Promised At"
                          type="datetime-local"
                          value={order.promisedAt ? isoToDatetimeLocal(order.promisedAt) : ""}
                          onChange={(e) => updateHeaderMut.mutate({ promisedAt: e.target.value ? datetimeLocalToISO(e.target.value) : null })}
                          InputLabelProps={{ shrink: true }}
                          sx={{ gridColumn: { xs: "1", sm: "1 / span 2" } }}
                        />

                        <TextField
                          size="small"
                          label="VET Code"
                          value={order.vetCode ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ vetCode: e.target.value || null })}
                          placeholder="(optional)"
                        />


                        <TextField
                          size="small"
                          label="Problem Description"
                          multiline
                          minRows={2}
                          value={order.problemDesc ?? ""}
                          onChange={(e) => updateHeaderMut.mutate({ problemDesc: e.target.value || null })}
                          sx={{ gridColumn: { xs: "1", sm: "1 / span 2" } }}
                        />
                      </Box>
                    </CardContent>
                  </Card>

                  {/* Right: summary / workflow */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      position: { lg: "sticky" },
                      top: { lg: 12 },
                      alignSelf: "start",
                    }}
                  >
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                        <Typography fontWeight={900}>Summary</Typography>

                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                          <Box>
                            <Typography fontSize={11} color="text.secondary">
                              Subtotal
                            </Typography>
                            <Typography fontSize={18} fontWeight={900}>
                              {fmtMoney((order as any).subTotal)}
                            </Typography>
                          </Box>

                          <Box>
                            <Typography fontSize={11} color="text.secondary">
                              Discount
                            </Typography>
                            <Typography fontSize={18} fontWeight={900}>
                              {fmtMoney((order as any).discount)}
                            </Typography>
                          </Box>

                          <Box>
                            <Typography fontSize={11} color="text.secondary">
                              Paid
                            </Typography>
                            <Typography fontSize={18} fontWeight={900}>
                              {fmtMoney(paidTotal)}
                            </Typography>
                          </Box>

                          <Box>
                            <Typography fontSize={11} color="text.secondary">
                              Balance
                            </Typography>
                            <Typography fontSize={18} fontWeight={900} color={balance > 0 ? "error.main" : "success.main"}>
                              {fmtMoney(balance)}
                            </Typography>
                          </Box>
                        </Box>

                        <Divider />

                        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                          <TextField
                            size="small"
                            label="Discount"
                            value={closeDiscount}
                            onChange={(e) => {
                              setCloseDiscount(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS));
                              setDiscountTouched(true);
                            }}
                            onBlur={() => setCloseDiscount(normalizeMoneyInput(closeDiscount, { emptyAsZero: true }))}
                            sx={{ flex: 1 }}
                            inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                          />
                          <Button
                            variant="outlined"
                            disabled={statusLocked || toMinor(closeDiscount) < 0 || discountMut.isPending}
                            onClick={() => {
                              setDetailError(null);
                              const subtotalMinor = toMinor((order as any).subTotal ?? 0);
                              const discMinor = clampMinorNonNegative(Math.min(toMinor(closeDiscount), subtotalMinor));
                              discountMut.mutate({ discount: toMajorNumber(discMinor) });
                            }}
                          >
                            Apply
                          </Button>
                        </Box>

                        <Divider />

                        <Typography fontWeight={900}>Workflow</Typography>

                        {(() => {
                          const locked = statusLocked;
                          const canCleaning = !locked && order.status === "RECEIVED";
                          const canRepairing = !locked && ["RECEIVED", "CLEANING"].includes(order.status);
                          const canReady = !locked && ["RECEIVED", "CLEANING", "REPAIRING"].includes(order.status);
                          const canCancel = !locked;
                          const canDeliver = order.status === "READY" && order.paymentStatus === "PAID" && balanceMinor <= 0;

                          const deliverDisabledReason = (() => {
                            if (order.status !== "READY") return "Set status to READY first.";
                            if (order.paymentStatus !== "PAID" || balanceMinor > 0) return `Balance must be paid (balance: ${fmtMoney(balance)}).`;
                            return "";
                          })();

                          const deliverWarnings = (() => {
                            const w: string[] = [];
                            if (!order.promisedAt) w.push("No promised date set.");
                            const lineCount = (order.lines ?? []).length;
                            const partCount = (order.parts ?? []).length;
                            if (lineCount + partCount === 0) w.push("No services/parts added.");
                            return w;
                          })();

                          return (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={!canCleaning}
                                onClick={() => {
                                  setDetailError(null);
                                  statusMut.mutate({ status: "CLEANING", note: statusNote || null });
                                  setStatusNote("");
                                }}
                              >
                                CLEANING
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={!canRepairing}
                                onClick={() => {
                                  setDetailError(null);
                                  statusMut.mutate({ status: "REPAIRING", note: statusNote || null });
                                  setStatusNote("");
                                }}
                              >
                                REPAIRING
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                disabled={!canReady}
                                onClick={() => {
                                  setDetailError(null);
                                  const subtotalMinor = toMinor((order as any).subTotal ?? 0);
                                  const discMinor = clampMinorNonNegative(Math.min(toMinor(closeDiscount), subtotalMinor));
                                  readyMut.mutate({ discount: toMajorNumber(discMinor) });
                                  setStatusNote("");
                                }}
                              >
                                READY
                              </Button>
                              <Tooltip title={deliverDisabledReason} disableHoverListener={!deliverDisabledReason}>
                                <span>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={!canDeliver}
                                    onClick={() => {
                                      setDetailError(null);
                                      setConfirm({
                                        title: "Deliver ticket?",
                                        confirmText: "Deliver",
                                        confirmColor: "success",
                                        message: (
                                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                            <Typography>Mark this ticket as <b>DELIVERED</b>?</Typography>
                                            {deliverWarnings.length ? (
                                              <Alert severity="warning">
                                                <Typography fontWeight={900} sx={{ mb: 0.5 }}>
                                                  Quick check
                                                </Typography>
                                                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                                  {deliverWarnings.map((x) => (
                                                    <li key={x}>{x}</li>
                                                  ))}
                                                </Box>
                                              </Alert>
                                            ) : null}
                                          </Box>
                                        ),
                                        onConfirm: () => {
                                          setConfirm(null);
                                          deliverMut.mutate();
                                          setStatusNote("");
                                        },
                                      });
                                    }}
                                  >
                                    Deliver
                                  </Button>
                                </span>
                              </Tooltip>

                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                disabled={!canCancel}
                                onClick={() => {
                                  setDetailError(null);
                                  setConfirm({
                                    title: "Cancel ticket?",
                                    confirmText: "Cancel Ticket",
                                    confirmColor: "error",
                                    message: (
                                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                        <Typography>
                                          This will mark the ticket as <b>CANCELLED</b>. It will stop the workflow and hide from the Repair Board.
                                        </Typography>
                                        <Alert severity="warning">
                                          Use this only if the customer cancels the job. If you already received money, refund first.
                                        </Alert>
                                      </Box>
                                    ),
                                    onConfirm: () => {
                                      setConfirm(null);
                                      statusMut.mutate({ status: "CANCELLED", note: statusNote || null });
                                      setStatusNote("");
                                    },
                                  });
                                }}
                              >
                                Cancel
                              </Button>

                              {!canDeliver && order.status === "READY" ? (
                                <Typography fontSize={11} color="text.secondary">
                                  {deliverDisabledReason || "Deliver requires PAID status."}
                                </Typography>
                              ) : null}
                            </Stack>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Typography fontWeight={900}>Recent activity</Typography>
                          <Button
                            size="small"
                            onClick={() => {
                              setDetailTab(4);
                              try {
                                localStorage.setItem(detailTabKey, "4");
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            View all
                          </Button>
                        </Box>

                        {timelineItems.length ? (
                          timelineItems.slice(0, 3).map((it) => (
                            <Box key={it.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                              <Box sx={{ flex: 1 }}>
                                <Typography fontSize={12} fontWeight={900}>
                                  {it.title}
                                </Typography>
                                <Typography fontSize={11} color="text.secondary">
                                  {it.subtitle}
                                </Typography>
                              </Box>
                              <Chip size="small" label={it.type} />
                            </Box>
                          ))
                        ) : (
                          <Typography fontSize={11} color="text.secondary">
                            (No activity yet)
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  </Box>
                </Box>
              </TabPanel>

              {/* Services */}
              <TabPanel value={detailTab} index={1}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography fontWeight={900}>Service Lines</Typography>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "2fr 3fr 1fr 1fr auto" },
                        gap: 1.5,
                        alignItems: "center",
                      }}
                    >
                      <TextField
                        size="small"
                        select
                        label="Catalog"
                        value={lineServiceId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLineServiceId(id);
                          if (!id) return;
                          const svc = (repairServicesQ.data ?? []).find((x) => x.id === id);
                          if (svc) {
                            setLineDesc(svc.name);
                            setLineQty(1);
                            setLinePrice(normalizeMoneyInput(String(svc.defaultPrice ?? 0), { emptyAsZero: true }));
                          }
                        }}
                      >
                        <MenuItem value="">Custom</MenuItem>
                        {(repairServicesQ.data ?? [])
                          .filter((x) => x.active)
                          .map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name} • {fmtMoney(s.defaultPrice)}
                            </MenuItem>
                          ))}
                      </TextField>

                      <TextField size="small" label="Description" value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} />

                      <TextField size="small" label="Qty" type="number" value={lineQty} onChange={(e) => setLineQty(Number(e.target.value))} inputProps={{ min: 1 }} />

                      <TextField
                        size="small"
                        label="Price"
                        value={linePrice}
                        onChange={(e) => setLinePrice(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS))}
                        onBlur={() => setLinePrice(normalizeMoneyInput(linePrice, { emptyAsZero: true }))}
                        inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                      />

                      <Button
                        variant="contained"
                        onClick={() => {
                          setDetailError(null);
                          if (!lineDesc.trim()) {
                            setDetailError("Line description required");
                            return;
                          }
                          addLineMut.mutate({ repairServiceId: lineServiceId || null, description: lineDesc, qty: lineQty, price: toMajorNumber(toMinor(linePrice)) });
                          setLineServiceId("");
                          setLineDesc("");
                          setLineQty(1);
                          setLinePrice("0");
                        }}
                      >
                        Add
                      </Button>
                    </Box>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Description</TableCell>
                            <TableCell width={90} align="right">
                              Qty
                            </TableCell>
                            <TableCell width={130} align="right">
                              Price
                            </TableCell>
                            <TableCell width={140} align="right">
                              Total
                            </TableCell>
                            <TableCell width={110} align="right">
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredLines.length ? (
                            filteredLines.map((l) => (
                              <TableRow key={l.id}>
                                <TableCell>{l.description}</TableCell>
                                <TableCell align="right">{l.qty}</TableCell>
                                <TableCell align="right">{fmtMoney(l.price)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 900 }}>
                                  {fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}
                                </TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      setConfirm({
                                        title: "Delete service line?",
                                        confirmText: "Delete",
                                        confirmColor: "error",
                                        message: (
                                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                            <Typography>
                                              Delete this service line?
                                            </Typography>
                                            <Alert severity="warning">
                                              <Typography fontWeight={900}>{l.description}</Typography>
                                            </Alert>
                                          </Box>
                                        ),
                                        onConfirm: () => {
                                          setConfirm(null);
                                          delLineMut.mutate(l.id);
                                        },
                                      })
                                    }
                                  >
                                    Delete
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <Typography variant="body2" color="text.secondary">
                                  {detailSearchNorm ? "No matching services." : "No services yet — add from catalog."}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </TabPanel>

              {/* Parts */}
              <TabPanel value={detailTab} index={2}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography fontWeight={900}>Parts</Typography>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "3fr 1fr 1fr auto" },
                        gap: 1.5,
                        alignItems: "center",
                      }}
                    >
                      <TextField
                        size="small"
                        select
                        label="Item"
                        value={partItemId}
                        onChange={(e) => setPartItemId(e.target.value)}
                      >
                        <MenuItem value="">Select item</MenuItem>
                        {(itemsQ.data ?? []).map((it) => (
                          <MenuItem key={it.id} value={it.id}>
                            {it.name}
                          </MenuItem>
                        ))}
                      </TextField>

                      <TextField size="small" label="Qty" type="number" value={partQty} onChange={(e) => setPartQty(Number(e.target.value))} inputProps={{ min: 1 }} />

                      <TextField
                        size="small"
                        label="Unit Price"
                        value={partPrice}
                        onChange={(e) => setPartPrice(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS))}
                        onBlur={() => setPartPrice(normalizeMoneyInput(partPrice, { emptyAsZero: true }))}
                        inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                      />

                      <Button
                        variant="contained"
                        onClick={() => {
                          setDetailError(null);
                          if (!partItemId) {
                            setDetailError("Select an item");
                            return;
                          }
                          addPartMut.mutate({ itemId: partItemId, qty: partQty, unitPrice: toMajorNumber(toMinor(partPrice)) });
                          setPartItemId("");
                          setPartQty(1);
                          setPartPrice("0");
                        }}
                      >
                        Add
                      </Button>
                    </Box>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Item</TableCell>
                            <TableCell width={90} align="right">
                              Qty
                            </TableCell>
                            <TableCell width={130} align="right">
                              Unit Price
                            </TableCell>
                            <TableCell width={140} align="right">
                              Total
                            </TableCell>
                            <TableCell width={110} align="right">
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredParts.length ? (
                            filteredParts.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell>{p.item?.name ?? p.itemId}</TableCell>
                                <TableCell align="right">{p.qty}</TableCell>
                                <TableCell align="right">{fmtMoney(p.unitPrice)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 900 }}>
                                  {fmtMoney(minorToMajorString(lineTotalMinor(p.unitPrice, p.qty)))}
                                </TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      setConfirm({
                                        title: "Delete part?",
                                        confirmText: "Delete",
                                        confirmColor: "error",
                                        message: (
                                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                            <Typography>Delete this part line?</Typography>
                                            <Alert severity="warning">
                                              <Typography fontWeight={900}>{p.item?.name ?? p.itemId}</Typography>
                                            </Alert>
                                          </Box>
                                        ),
                                        onConfirm: () => {
                                          setConfirm(null);
                                          delPartMut.mutate(p.id);
                                        },
                                      })
                                    }
                                  >
                                    Delete
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <Typography variant="body2" color="text.secondary">
                                  {detailSearchNorm ? "No matching parts." : "No parts yet — add items used for repair."}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </TabPanel>

              {/* Payments */}
              <TabPanel value={detailTab} index={3}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Typography fontWeight={900}>Payments</Typography>

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                      {[1000, 2000, 5000, 10000, 20000].map((a) => (
                        <Button key={a} size="small" variant="outlined" onClick={() => setPayAmount(String(a))}>
                          {fmtMoney(a)}
                        </Button>
                      ))}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPayAmount(minorToMajorString(clampMinorNonNegative(balanceMinor)))}
                        disabled={balanceMinor <= 0}
                      >
                        Pay Balance
                      </Button>
                    </Stack>

                    <Typography variant="caption" color="text.secondary">
                      Shortcuts: Ctrl+Enter = Add Payment, Alt+1..5 = quick amounts.
                    </Typography>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 2fr auto" }, gap: 1.5, alignItems: "start" }}>
                      <TextField
                        size="small"
                        label="Amount"
                        value={payAmount}
                        onChange={(e) => setPayAmount(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS))}
                        onBlur={() => setPayAmount(normalizeMoneyInput(payAmount, { emptyAsZero: false }))}
                        inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                        helperText={!canAddPayment ? "Enter amount > 0" : " "}
                      />
                      <TextField size="small" select label="Method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
                        <MenuItem value="CASH">CASH</MenuItem>
                        <MenuItem value="CARD">CARD</MenuItem>
                        <MenuItem value="TRANSFER">TRANSFER</MenuItem>
                        <MenuItem value="OTHER">OTHER</MenuItem>
                      </TextField>
                      <TextField size="small" label="Note" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                      <Button
                        variant="contained"
                        disabled={!canAddPayment || paymentMut.isPending}
                        onClick={addPayment}
                      >
                        Add Payment
                      </Button>
                    </Box>

                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell>When / Method</TableCell>
                            <TableCell>Note</TableCell>
                            <TableCell width={140} align="right">
                              Amount
                            </TableCell>
                            <TableCell width={110} align="right">
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredPayments.length ? (
                            filteredPayments.map((p) => {
                              const amtMinor = toMinor(p.amount);
                              const isRefund = amtMinor < 0;
                              const amt = minorToMajorString(amtMinor);
                              return (
                                <TableRow key={p.id}>
                                  <TableCell>{isRefund ? "REFUND" : "PAYMENT"}</TableCell>
                                  <TableCell>
                                    <Typography fontSize={12} fontWeight={800}>
                                      {fmtDate(p.paidAt)} • {p.method}
                                      {p.receivedBy?.username ? ` • ${p.receivedBy.username}` : ""}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>{p.note ?? ""}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 900, color: isRefund ? "error.main" : undefined }}>
                                    {fmtMoney(amt)}
                                  </TableCell>
                                  <TableCell align="right">
                                    {!isRefund ? (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        onClick={() => {
                                          setRefundPayment(p);
                                          setRefundAmount(minorToMajorString(Math.abs(amtMinor)));
                                          setRefundReason("");
                                          setRefundOpen(true);
                                        }}
                                      >
                                        Refund
                                      </Button>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <Typography variant="body2" color="text.secondary">
                                  {detailSearchNorm ? "No matching payments." : "No payments — use quick buttons above."}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </TabPanel>

              {/* Timeline */}
              <TabPanel value={detailTab} index={4}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Typography fontWeight={900}>Timeline</Typography>

                    {filteredTimeline.length ? (
                      filteredTimeline.map((it) => (
                        <Box key={it.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography fontSize={12} fontWeight={900}>
                              {it.title}
                            </Typography>
                            <Typography fontSize={11} color="text.secondary">
                              {it.subtitle}
                            </Typography>
                          </Box>
                          <Chip size="small" label={it.type} />
                        </Box>
                      ))
                    ) : (
                      <Typography fontSize={11} color="text.secondary">
                        {detailSearchNorm ? "(No matching timeline items)" : "(No timeline yet)"}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </TabPanel>

              {/* Confirm dialog */}
              <Dialog open={!!confirm} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
                <DialogTitle>{confirm?.title ?? "Confirm"}</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                  {confirm?.message ?? null}
                </DialogContent>
                <DialogActions>
                  <Button variant="outlined" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color={confirm?.confirmColor ?? "primary"}
                    onClick={() => confirm?.onConfirm()}
                  >
                    {confirm?.confirmText ?? "OK"}
                  </Button>
                </DialogActions>
              </Dialog>

              {/* Refund dialog */}
              <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Refund Payment</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
                  {refundPayment ? (
                    <Alert severity="info">
                      Original: {fmtMoney(refundPayment.amount)} • {refundPayment.method} • {fmtDate(refundPayment.paidAt)}
                    </Alert>
                  ) : null}

                  <TextField
                    size="small"
                    label="Refund Amount"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(sanitizeMoneyInput(e.target.value, MONEY_DECIMALS))}
                    onBlur={() => setRefundAmount(normalizeMoneyInput(refundAmount, { emptyAsZero: false }))}
                    inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                  />

                  <TextField
                    size="small"
                    label="Reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. customer canceled / wrong amount"
                  />

                  <Typography fontSize={11} color="text.secondary">
                    Refund creates a negative payment record and updates balance automatically.
                  </Typography>
                </DialogContent>
                <DialogActions>
                  <Button variant="outlined" onClick={() => setRefundOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={!refundPayment || toMinor(refundAmount) <= 0 || !refundReason || refundMut.isPending}
                    onClick={() => {
                      if (!refundPayment) return;
                      setDetailError(null);
                      refundMut.mutate(
                        { paymentId: refundPayment.id, amount: toMajorNumber(toMinor(refundAmount)), reason: refundReason },
                        {
                          onSuccess: () => {
                            setRefundOpen(false);
                            setRefundPayment(null);
                            setRefundAmount("");
                            setRefundReason("");
                          },
                        }
                      );
                    }}
                  >
                    Confirm Refund
                  </Button>
                </DialogActions>
              </Dialog>
            </>
          ) : null}
        </DialogContent>

        <DialogActions
          sx={{
            p: 2,
            position: "sticky",
            bottom: 0,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button variant="outlined" onClick={closeDetail}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
