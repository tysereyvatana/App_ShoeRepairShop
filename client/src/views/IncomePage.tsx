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
  MenuItem,
  Tabs,
  Tab,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Expense, OtherIncome, Paged, Payment } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { fmtDate, fmtMoney } from "../lib/format";
import { MONEY_DECIMALS, moneyTextInputProps, sanitizeMoneyInput, toMajorNumber, toMinor } from "../lib/money";

type IncomeForm = {
  title: string;
  amount: number;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  receivedAt: string;
  note: string;
};

type ExpenseForm = {
  title: string;
  amount: number;
  paidAt: string;
  note: string;
};

const emptyIncome: IncomeForm = { title: "", amount: 0, method: "CASH", receivedAt: new Date().toISOString().slice(0, 10), note: "" };
const emptyExpense: ExpenseForm = { title: "", amount: 0, paidAt: new Date().toISOString().slice(0, 10), note: "" };

function TabPanel(props: { value: number; index: number; children: React.ReactNode }) {
  return props.value === props.index ? <Box sx={{ mt: 2 }}>{props.children}</Box> : null;
}

export function IncomePage() {
  const qc = useQueryClient();

  const [tab, setTab] = React.useState(0);
  const [search, setSearch] = React.useState("");

  // Dialog state for Other Income
  const [incomeOpen, setIncomeOpen] = React.useState(false);
  const [editingIncome, setEditingIncome] = React.useState<OtherIncome | null>(null);
  const [incomeForm, setIncomeForm] = React.useState<IncomeForm>(emptyIncome);
  const [incomeError, setIncomeError] = React.useState<string | null>(null);

  // Dialog state for Expenses
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [editingExpense, setEditingExpense] = React.useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = React.useState<ExpenseForm>(emptyExpense);
  const [expenseError, setExpenseError] = React.useState<string | null>(null);

  const paymentsQ = useQuery({
    queryKey: ["payments", search],
    queryFn: async () => {
      const res = await api.get<Paged<Payment>>("/payments", { params: { q: search, page: 1, pageSize: 50 } });
      return res.data;
    },
  });

  const otherIncomeQ = useQuery({
    queryKey: ["other-income", search],
    queryFn: async () => {
      const res = await api.get<Paged<OtherIncome>>("/other-income", { params: { q: search, page: 1, pageSize: 50 } });
      return res.data;
    },
  });

  const expensesQ = useQuery({
    queryKey: ["expenses", search],
    queryFn: async () => {
      const res = await api.get<Paged<Expense>>("/expenses", { params: { q: search, page: 1, pageSize: 50 } });
      return res.data;
    },
  });

  // Other income mutations
  const createIncomeMut = useMutation({
    mutationFn: async (payload: IncomeForm) =>
      (await api.post<OtherIncome>("/other-income", {
        title: payload.title,
        amount: payload.amount,
        method: payload.method,
        receivedAt: payload.receivedAt ? new Date(payload.receivedAt).toISOString() : undefined,
        note: payload.note || null,
      })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["other-income"] });
      setIncomeOpen(false);
    },
    onError: (e: any) => setIncomeError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateIncomeMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<IncomeForm> }) =>
      (await api.put<OtherIncome>(`/other-income/${id}`, {
        ...payload,
        ...(payload.receivedAt ? { receivedAt: new Date(payload.receivedAt).toISOString() } : {}),
        ...(payload.note !== undefined ? { note: payload.note || null } : {}),
      })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["other-income"] });
      setIncomeOpen(false);
    },
    onError: (e: any) => setIncomeError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteIncomeMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/other-income/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["other-income"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  // Expenses mutations
  const createExpenseMut = useMutation({
    mutationFn: async (payload: ExpenseForm) =>
      (await api.post<Expense>("/expenses", {
        title: payload.title,
        amount: payload.amount,
        paidAt: payload.paidAt ? new Date(payload.paidAt).toISOString() : undefined,
        note: payload.note || null,
      })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expenses"] });
      setExpenseOpen(false);
    },
    onError: (e: any) => setExpenseError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateExpenseMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ExpenseForm> }) =>
      (await api.put<Expense>(`/expenses/${id}`, {
        ...payload,
        ...(payload.paidAt ? { paidAt: new Date(payload.paidAt).toISOString() } : {}),
        ...(payload.note !== undefined ? { note: payload.note || null } : {}),
      })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expenses"] });
      setExpenseOpen(false);
    },
    onError: (e: any) => setExpenseError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteExpenseMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const paymentsColumns: GridColDef<Payment>[] = [
    { field: "paidAt", headerName: "Paid At", width: 180, valueGetter: (v, r) => fmtDate(r.paidAt) },
    {
      field: "service",
      headerName: "Service",
      width: 220,
      valueGetter: (v, r) => (r.serviceOrder ? `${r.serviceOrder.code} • ${r.serviceOrder.customer?.name ?? ""}` : "—"),
    },
    { field: "method", headerName: "Method", width: 120 },
    { field: "amount", headerName: "Amount", width: 140, valueGetter: (v, r) => fmtMoney(r.amount) },
    { field: "note", headerName: "Note", flex: 1, minWidth: 220, valueGetter: (v, r) => r.note ?? "" },
  ];

  const otherIncomeColumns: GridColDef<OtherIncome>[] = [
    { field: "receivedAt", headerName: "Received", width: 180, valueGetter: (v, r) => fmtDate(r.receivedAt) },
    { field: "title", headerName: "Title", flex: 1, minWidth: 220 },
    { field: "method", headerName: "Method", width: 120 },
    { field: "amount", headerName: "Amount", width: 140, valueGetter: (v, r) => fmtMoney(r.amount) },
    { field: "note", headerName: "Note", flex: 1, minWidth: 220, valueGetter: (v, r) => r.note ?? "" },
    {
      field: "actions",
      headerName: "Actions",
      width: 220,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setIncomeError(null);
              setEditingIncome(params.row);
              setIncomeForm({
                title: params.row.title,
                amount: Number(params.row.amount),
                method: params.row.method,
                receivedAt: params.row.receivedAt.slice(0, 10),
                note: params.row.note ?? "",
              });
              setIncomeOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              if (confirm("Delete this record?")) deleteIncomeMut.mutate(params.row.id);
            }}
          >
            Delete
          </Button>
        </Box>
      ),
    },
  ];

  const expensesColumns: GridColDef<Expense>[] = [
    { field: "paidAt", headerName: "Paid", width: 180, valueGetter: (v, r) => fmtDate(r.paidAt) },
    { field: "title", headerName: "Title", flex: 1, minWidth: 220 },
    { field: "amount", headerName: "Amount", width: 140, valueGetter: (v, r) => fmtMoney(r.amount) },
    { field: "note", headerName: "Note", flex: 1, minWidth: 220, valueGetter: (v, r) => r.note ?? "" },
    {
      field: "actions",
      headerName: "Actions",
      width: 220,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setExpenseError(null);
              setEditingExpense(params.row);
              setExpenseForm({
                title: params.row.title,
                amount: Number(params.row.amount),
                paidAt: params.row.paidAt.slice(0, 10),
                note: params.row.note ?? "",
              });
              setExpenseOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              if (confirm("Delete this record?")) deleteExpenseMut.mutate(params.row.id);
            }}
          >
            Delete
          </Button>
        </Box>
      ),
    },
  ];

  const openIncomeCreate = () => {
    setIncomeError(null);
    setEditingIncome(null);
    setIncomeForm(emptyIncome);
    setIncomeOpen(true);
  };

  const saveIncome = () => {
    setIncomeError(null);
    if (!incomeForm.title.trim()) return setIncomeError("Title is required");
    if (incomeForm.amount <= 0) return setIncomeError("Amount must be > 0");
    if (editingIncome) updateIncomeMut.mutate({ id: editingIncome.id, payload: incomeForm });
    else createIncomeMut.mutate(incomeForm);
  };

  const openExpenseCreate = () => {
    setExpenseError(null);
    setEditingExpense(null);
    setExpenseForm(emptyExpense);
    setExpenseOpen(true);
  };

  const saveExpense = () => {
    setExpenseError(null);
    if (!expenseForm.title.trim()) return setExpenseError("Title is required");
    if (expenseForm.amount <= 0) return setExpenseError("Amount must be > 0");
    if (editingExpense) updateExpenseMut.mutate({ id: editingExpense.id, payload: expenseForm });
    else createExpenseMut.mutate(expenseForm);
  };

  const headerAdd = tab === 1 ? openIncomeCreate : tab === 2 ? openExpenseCreate : undefined;
  const headerAddLabel = tab === 1 ? "New Other Income" : tab === 2 ? "New Expense" : undefined;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Income & Expenses"
        subtitle="Track payments, other income, and expenses."
        search={search}
        onSearchChange={setSearch}
        onAdd={headerAdd}
        addLabel={headerAddLabel}
      />

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Payments" />
            <Tab label="Other Income" />
            <Tab label="Expenses" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Box sx={{ height: 520 }}>
              <DataGrid
                rows={paymentsQ.data?.data ?? []}
                columns={paymentsColumns}
                loading={paymentsQ.isLoading}
                getRowId={(r) => r.id}
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
              />
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Box sx={{ height: 520 }}>
              <DataGrid
                rows={otherIncomeQ.data?.data ?? []}
                columns={otherIncomeColumns}
                loading={otherIncomeQ.isLoading}
                getRowId={(r) => r.id}
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
              />
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Box sx={{ height: 520 }}>
              <DataGrid
                rows={expensesQ.data?.data ?? []}
                columns={expensesColumns}
                loading={expensesQ.isLoading}
                getRowId={(r) => r.id}
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
              />
            </Box>
          </TabPanel>
        </CardContent>
      </Card>

      {/* Other income dialog */}
      <Dialog open={incomeOpen} onClose={() => setIncomeOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingIncome ? "Edit Other Income" : "New Other Income"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {incomeError ? <Alert severity="error">{incomeError}</Alert> : null}
          <TextField label="Title" value={incomeForm.title} onChange={(e) => setIncomeForm({ ...incomeForm, title: e.target.value })} />
          <TextField
            label="Amount"
            value={incomeForm.amount}
            onChange={(e) => {
              const s = sanitizeMoneyInput(e.target.value, MONEY_DECIMALS);
              setIncomeForm({ ...incomeForm, amount: toMajorNumber(toMinor(s)) });
            }}
            inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
          />
          <TextField select label="Method" value={incomeForm.method} onChange={(e) => setIncomeForm({ ...incomeForm, method: e.target.value as any })}>
            <MenuItem value="CASH">CASH</MenuItem>
            <MenuItem value="CARD">CARD</MenuItem>
            <MenuItem value="TRANSFER">TRANSFER</MenuItem>
            <MenuItem value="OTHER">OTHER</MenuItem>
          </TextField>
          <TextField label="Received Date" type="date" value={incomeForm.receivedAt} onChange={(e) => setIncomeForm({ ...incomeForm, receivedAt: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField label="Note" value={incomeForm.note} onChange={(e) => setIncomeForm({ ...incomeForm, note: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setIncomeOpen(false)}>Cancel</Button>
          <Button onClick={saveIncome} disabled={createIncomeMut.isPending || updateIncomeMut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Expense dialog */}
      <Dialog open={expenseOpen} onClose={() => setExpenseOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingExpense ? "Edit Expense" : "New Expense"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {expenseError ? <Alert severity="error">{expenseError}</Alert> : null}
          <TextField label="Title" value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} />
          <TextField
            label="Amount"
            value={expenseForm.amount}
            onChange={(e) => {
              const s = sanitizeMoneyInput(e.target.value, MONEY_DECIMALS);
              setExpenseForm({ ...expenseForm, amount: toMajorNumber(toMinor(s)) });
            }}
            inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
          />
          <TextField label="Paid Date" type="date" value={expenseForm.paidAt} onChange={(e) => setExpenseForm({ ...expenseForm, paidAt: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField label="Note" value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setExpenseOpen(false)}>Cancel</Button>
          <Button onClick={saveExpense} disabled={createExpenseMut.isPending || updateExpenseMut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
