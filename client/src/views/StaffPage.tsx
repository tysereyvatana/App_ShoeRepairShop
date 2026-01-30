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
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Staff, Paged } from "../lib/types";
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
  code?: string | null;
  name: string;
  phone?: string | null;
  position?: string | null;
  salary: string; // money text (KHR integer)
  status: "ACTIVE" | "INACTIVE";
};

type ApiPayload = Omit<FormState, "salary"> & { salary: number };

const empty: FormState = {
  code: null,
  name: "",
  phone: null,
  position: null,
  salary: "0",
  status: "ACTIVE",
};

export function StaffPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Staff | null>(null);
  const [form, setForm] = React.useState<FormState>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["staff", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<Staff>>("/staff", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const createMut = useMutation({
    mutationFn: async (payload: ApiPayload) => (await api.post<Staff>("/staff", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ApiPayload> }) =>
      (await api.put<Staff>(`/staff/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/staff/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const columns: GridColDef<Staff>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 220 },
    { field: "code", headerName: "Code", width: 140, valueGetter: (v, r) => r.code ?? "" },
    { field: "phone", headerName: "Phone", width: 160, valueGetter: (v, r) => r.phone ?? "" },
    { field: "position", headerName: "Position", width: 160, valueGetter: (v, r) => r.position ?? "" },
    { field: "salary", headerName: "Salary", width: 140, valueGetter: (v, r) => fmtMoney(r.salary) },
    { field: "status", headerName: "Status", width: 120 },
    {
      field: "user",
      headerName: "Linked User",
      width: 160,
      valueGetter: (v, r) => r.user?.username ?? "",
    },
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
                code: params.row.code,
                name: params.row.name,
                phone: params.row.phone,
                position: params.row.position,
                salary: normalizeMoneyInput(params.row.salary ?? "0", { decimals: MONEY_DECIMALS, emptyAsZero: true }),
                status: params.row.status,
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
              if (confirm("Delete this staff record?")) deleteMut.mutate(params.row.id);
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
    if (!isAdmin) {
      setError("Only ADMIN can manage staff records");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    const payload: ApiPayload = {
      ...form,
      name: form.name.trim(),
      salary: toMinor(form.salary || "0", MONEY_DECIMALS),
    };

    if (editing) updateMut.mutate({ id: editing.id, payload });
    else createMut.mutate(payload);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Staff"
        subtitle="Manage employee records (ADMIN only)."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Staff"
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
        <DialogTitle>{editing ? "Edit Staff" : "New Staff"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField
            label="Code"
            value={form.code ?? ""}
            onChange={(e) => setForm({ ...form, code: e.target.value || null })}
          />
          <TextField
            label="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
          />
          <TextField
            label="Position"
            value={form.position ?? ""}
            onChange={(e) => setForm({ ...form, position: e.target.value || null })}
          />

          <TextField
            label="Salary"
            value={form.salary}
            onChange={(e) => setForm({ ...form, salary: sanitizeMoneyInput(e.target.value, MONEY_DECIMALS) })}
            onBlur={() =>
              setForm({
                ...form,
                salary: normalizeMoneyInput(form.salary, { decimals: MONEY_DECIMALS, emptyAsZero: true }),
              })
            }
            inputProps={{ ...moneyTextInputProps(MONEY_DECIMALS) }}
          />

          <TextField
            select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as any })}
          >
            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
            <MenuItem value="INACTIVE">INACTIVE</MenuItem>
          </TextField>
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
