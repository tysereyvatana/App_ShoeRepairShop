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
  FormControlLabel,
  Switch,
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Item, Paged } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { fmtMoney } from "../lib/format";
import { useAuth } from "../lib/auth";
import { moneyTextInputProps, normalizeMoneyInput, sanitizeMoneyInput, toMinor } from "../lib/money";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type ItemForm = {
  sku?: string | null;
  barcode?: string | null;
  name: string;
  unit?: string | null;
  cost: number;
  price: number;
  reorderLevel: number;
  active: boolean;
};

const empty: ItemForm = { sku: null, barcode: null, name: "", unit: null, cost: 0, price: 0, reorderLevel: 0, active: true };

export function ItemsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [form, setForm] = React.useState<ItemForm>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;

  const itemsQ = useQuery({
    queryKey: ["items", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<Item>>("/items", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const createMut = useMutation({
    mutationFn: async (payload: ItemForm) => (await api.post<Item>("/items", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["items"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ItemForm> }) =>
      (await api.put<Item>(`/items/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["items"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/items/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const columns: GridColDef<Item>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 220 },
    { field: "sku", headerName: "SKU", width: 150, valueGetter: (v, r) => r.sku ?? "" },
    { field: "barcode", headerName: "Barcode", width: 160, valueGetter: (v, r) => r.barcode ?? "" },
    { field: "unit", headerName: "Unit", width: 120, valueGetter: (v, r) => r.unit ?? "" },
    { field: "cost", headerName: "Cost", width: 120, valueGetter: (v, r) => fmtMoney(r.cost) },
    { field: "price", headerName: "Price", width: 120, valueGetter: (v, r) => fmtMoney(r.price) },
    { field: "reorderLevel", headerName: "Reorder", width: 110 },
    { field: "active", headerName: "Active", width: 100, valueGetter: (v, r) => (r.active ? "Yes" : "No") },
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
              setError(null);
              setEditing(params.row);
              setForm({
                sku: params.row.sku,
                barcode: params.row.barcode,
                name: params.row.name,
                unit: params.row.unit,
                cost: Number(params.row.cost),
                price: Number(params.row.price),
                reorderLevel: params.row.reorderLevel,
                active: params.row.active,
              });
              setDialogOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={!isAdmin}
            onClick={() => {
              if (confirm("Delete this item?")) deleteMut.mutate(params.row.id);
            }}
          >
            Delete
          </Button>
        </Box>
      ),
    },
  ];

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setForm(empty);
    setDialogOpen(true);
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    // Ensure integers (KHR) via toMinor(major)->minor
    const payload: ItemForm = {
      ...form,
      cost: toMinor(form.cost),
      price: toMinor(form.price),
    };

    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Items"
        subtitle="Catalog of products/parts used in repairs and purchasing."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Item"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 520 }}>
            <DataGrid
              rows={itemsQ.data?.data ?? []}
              columns={columns}
              loading={itemsQ.isLoading || itemsQ.isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={itemsQ.data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Item" : "New Item"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="SKU" value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value || null })} />
          <TextField
            label="Barcode"
            value={form.barcode ?? ""}
            onChange={(e) => setForm({ ...form, barcode: e.target.value || null })}
          />
          <TextField label="Unit" value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value || null })} />

          <TextField
            label="Cost"
            value={String(form.cost ?? 0)}
            onChange={(e) => {
              const cleaned = sanitizeMoneyInput(e.target.value);
              setForm((f) => ({ ...f, cost: cleaned === "" ? 0 : Number(cleaned) }));
            }}
            onBlur={(e) => {
              const norm = normalizeMoneyInput(e.target.value);
              setForm((f) => ({ ...f, cost: norm === "" ? 0 : Number(norm) }));
            }}
            {...moneyTextInputProps()}
          />
          <TextField
            label="Price"
            value={String(form.price ?? 0)}
            onChange={(e) => {
              const cleaned = sanitizeMoneyInput(e.target.value);
              setForm((f) => ({ ...f, price: cleaned === "" ? 0 : Number(cleaned) }));
            }}
            onBlur={(e) => {
              const norm = normalizeMoneyInput(e.target.value);
              setForm((f) => ({ ...f, price: norm === "" ? 0 : Number(norm) }));
            }}
            {...moneyTextInputProps()}
          />

          <TextField
            label="Reorder Level"
            type="number"
            value={form.reorderLevel}
            onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value || 0) })}
          />

          <FormControlLabel
            control={<Switch checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
            label="Active"
          />
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
