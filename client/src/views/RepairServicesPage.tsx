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
  Switch,
  FormControlLabel,
  Alert,
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Paged, RepairService } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { useAuth } from "../lib/auth";
import { fmtMoney } from "../lib/format";
import {
  MONEY_DECIMALS,
  moneyTextInputProps,
  normalizeMoneyInput,
  sanitizeMoneyInput,
  toMinor,
} from "../lib/money";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type FormState = {
  name: string;
  defaultPrice: string; // money text (KHR integer)
  defaultDurationMin: number;
  active: boolean;
};

type ApiPayload = {
  name: string;
  defaultPrice: number;
  defaultDurationMin: number;
  active: boolean;
};

const empty: FormState = { name: "", defaultPrice: "0", defaultDurationMin: 0, active: true };

export function RepairServicesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RepairService | null>(null);
  const [form, setForm] = React.useState<FormState>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["repair-services", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<RepairService>>("/repair-services", {
        params: { q: debouncedSearch, page, pageSize },
      });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const createMut = useMutation({
    mutationFn: async (payload: ApiPayload) => (await api.post<RepairService>("/repair-services", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["repair-services"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ApiPayload> }) =>
      (await api.put<RepairService>(`/repair-services/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["repair-services"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/repair-services/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["repair-services"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const columns: GridColDef<RepairService>[] = [
    { field: "name", headerName: "Service", flex: 1, minWidth: 240 },
    {
      field: "defaultPrice",
      headerName: "Default Price",
      width: 140,
      valueGetter: (v, r) => fmtMoney(r.defaultPrice),
    },
    {
      field: "defaultDurationMin",
      headerName: "Minutes",
      width: 110,
      valueGetter: (v, r) => (r.defaultDurationMin ?? 0).toString(),
    },
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
            disabled={!isAdmin}
            onClick={() => {
              setError(null);
              setEditing(params.row);
              setForm({
                name: params.row.name,
                defaultPrice: normalizeMoneyInput(params.row.defaultPrice ?? "0", { decimals: MONEY_DECIMALS, emptyAsZero: true }),
                defaultDurationMin: params.row.defaultDurationMin ?? 0,
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
              if (confirm("Delete this service?")) deleteMut.mutate(params.row.id);
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
      setError("Service name is required");
      return;
    }
    if (!isAdmin) {
      setError("Only ADMIN can create/update services");
      return;
    }

    const payload: ApiPayload = {
      name: form.name.trim(),
      defaultPrice: toMinor(form.defaultPrice || "0", MONEY_DECIMALS),
      defaultDurationMin: Number(form.defaultDurationMin) || 0,
      active: !!form.active,
    };

    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Service Catalog"
        subtitle="Predefined repair services for quick ticket creation."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Service"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 520 }}>
            <DataGrid
              rows={data?.data ?? []}
              columns={columns}
              loading={isLoading || isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Service" : "New Service"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <TextField label="Service Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Default Price"
              value={form.defaultPrice}
              onChange={(e) => setForm({ ...form, defaultPrice: sanitizeMoneyInput(e.target.value, MONEY_DECIMALS) })}
              onBlur={() =>
                setForm({
                  ...form,
                  defaultPrice: normalizeMoneyInput(form.defaultPrice, { decimals: MONEY_DECIMALS, emptyAsZero: true }),
                })
              }
              fullWidth
              inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS) }}
            />
            <TextField
              label="Default Minutes"
              type="number"
              value={form.defaultDurationMin}
              onChange={(e) => setForm({ ...form, defaultDurationMin: Number(e.target.value) })}
              fullWidth
              inputProps={{ min: 0, step: 1 }}
            />
          </Box>

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
