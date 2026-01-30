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
  Divider,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Item, Paged, Purchase, Supplier } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { fmtMoney, fmtDate } from "../lib/format";
import { MONEY_DECIMALS, moneyTextInputProps, sanitizeMoneyInput, toMajorNumber, toMinor } from "../lib/money";
import { useAuth } from "../lib/auth";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type LineForm = { key: string; itemId: string; qty: number; unitCost: number };

type PurchaseForm = {
  supplierId: string;
  invoiceNo: string;
  discount: number;
  purchasedAt: string; // ISO date input
  lines: LineForm[];
};

function newLine(): LineForm {
  return { key: Math.random().toString(36).slice(2), itemId: "", qty: 1, unitCost: 0 };
}

const empty: PurchaseForm = {
  supplierId: "",
  invoiceNo: "",
  discount: 0,
  purchasedAt: new Date().toISOString().slice(0, 10),
  lines: [newLine()],
};

export function PurchasesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Purchase | null>(null);
  const [form, setForm] = React.useState<PurchaseForm>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;


  const purchasesQ = useQuery({
    queryKey: ["purchases", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<Purchase>>("/purchases", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const suppliersQ = useQuery({
    queryKey: ["suppliers", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Supplier>>("/suppliers", { params: { q: "", page: 1, pageSize: 200 } });
      return res.data.data;
    },
  });

  const itemsQ = useQuery({
    queryKey: ["items", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Item>>("/items", { params: { q: "", page: 1, pageSize: 500 } });
      return res.data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (payload: any) => (await api.post<Purchase>("/purchases", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchases"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => (await api.put<Purchase>(`/purchases/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchases"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const receiveMut = useMutation({
    mutationFn: async (id: string) => (await api.post<Purchase>(`/purchases/${id}/receive`, {})).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Receive failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setForm({ ...empty, purchasedAt: new Date().toISOString().slice(0, 10), lines: [newLine()] });
    setDialogOpen(true);
  };

  const openEdit = async (p: Purchase) => {
    setError(null);
    const res = await api.get<Purchase>(`/purchases/${p.id}`);
    const full = res.data;
    setEditing(full);
    setForm({
      supplierId: full.supplierId,
      invoiceNo: full.invoiceNo ?? "",
      discount: Number(full.discount),
      purchasedAt: new Date(full.purchasedAt).toISOString().slice(0, 10),
      lines:
        (full.lines ?? []).map((l) => ({
          key: l.id,
          itemId: l.itemId,
          qty: l.qty,
          unitCost: Number(l.unitCost),
        })) || [newLine()],
    });
    setDialogOpen(true);
  };

  const save = () => {
    setError(null);
    if (!form.supplierId) return setError("Supplier is required");
    const lines = form.lines.filter((l) => l.itemId);
    if (lines.length === 0) return setError("At least 1 line is required");

    const payload = {
      supplierId: form.supplierId,
      invoiceNo: form.invoiceNo || null,
      discount: form.discount,
      purchasedAt: new Date(form.purchasedAt),
      lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCost: l.unitCost })),
    };

    if (editing) {
      if (editing.status !== "DRAFT") return setError("Only DRAFT purchases can be edited");
      updateMut.mutate({ id: editing.id, payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const columns: GridColDef<Purchase>[] = [
    { field: "purchasedAt", headerName: "Date", width: 190, valueGetter: (v, r) => fmtDate(r.purchasedAt) },
    { field: "supplier", headerName: "Supplier", flex: 1, minWidth: 220, valueGetter: (v, r) => r.supplier?.name ?? "" },
    { field: "invoiceNo", headerName: "Invoice", width: 160, valueGetter: (v, r) => r.invoiceNo ?? "" },
    { field: "status", headerName: "Status", width: 120 },
    { field: "total", headerName: "Total", width: 130, valueGetter: (v, r) => fmtMoney(r.total) },
    {
      field: "actions",
      headerName: "Actions",
      width: 320,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const row = params.row;
        return (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={row.status !== "DRAFT" || receiveMut.isPending}
              onClick={() => receiveMut.mutate(row.id)}
            >
              Receive
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={!isAdmin}
              onClick={() => {
                if (confirm("Delete this purchase?")) deleteMut.mutate(row.id);
              }}
            >
              Delete
            </Button>
          </Box>
        );
      },
    },
  ];

  const suppliers = suppliersQ.data ?? [];
  const items = itemsQ.data ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Purchases"
        subtitle="Create purchases and receive stock into inventory."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Purchase"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 540 }}>
            <DataGrid
              rows={purchasesQ.data?.data ?? []}
              columns={columns}
              loading={purchasesQ.isLoading || purchasesQ.isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={purchasesQ.data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing ? `Edit Purchase (${editing.status})` : "New Purchase"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TextField
              select
              label="Supplier"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              sx={{ minWidth: 260, flex: 1 }}
            >
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Invoice No"
              value={form.invoiceNo}
              onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
              sx={{ minWidth: 200 }}
            />

            <TextField
              label="Date"
              type="date"
              value={form.purchasedAt}
              onChange={(e) => setForm({ ...form, purchasedAt: e.target.value })}
              sx={{ minWidth: 170 }}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Discount"
              value={form.discount}
              onChange={(e) => {
                const s = sanitizeMoneyInput(e.target.value, MONEY_DECIMALS);
                setForm({ ...form, discount: toMajorNumber(toMinor(s)) });
              }}
              inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
              sx={{ minWidth: 140 }}
            />
          </Box>

          <Divider />

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography fontWeight={800}>Lines</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}
            >
              Add line
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {form.lines.map((l, idx) => (
              <Box key={l.key} sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <TextField
                  select
                  label="Item"
                  value={l.itemId}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], itemId: e.target.value };
                    setForm({ ...form, lines: next });
                  }}
                  sx={{ minWidth: 300, flex: 1 }}
                >
                  {items.map((it) => (
                    <MenuItem key={it.id} value={it.id}>
                      {it.name}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Qty"
                  type="number"
                  value={l.qty}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], qty: Number(e.target.value) };
                    setForm({ ...form, lines: next });
                  }}
                  sx={{ width: 120 }}
                />

                <TextField
                  label="Unit Cost"
                  value={l.unitCost}
                  onChange={(e) => {
                    const s = sanitizeMoneyInput(e.target.value, MONEY_DECIMALS);
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], unitCost: toMajorNumber(toMinor(s)) };
                    setForm({ ...form, lines: next });
                  }}
                  inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS), min: 0 }}
                  sx={{ width: 150 }}
                />

                <Button
                  color="error"
                  variant="outlined"
                  disabled={form.lines.length <= 1}
                  onClick={() => setForm({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}
                >
                  Remove
                </Button>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
