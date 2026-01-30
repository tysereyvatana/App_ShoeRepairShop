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
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Customer, Paged } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { useNavigate } from "react-router-dom";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type CustomerForm = {
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

const empty: CustomerForm = { code: null, name: "", phone: null, email: null, address: null, notes: null };

export function CustomersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState<CustomerForm>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const page = paginationModel.page + 1; // server is 1-based
  const pageSize = paginationModel.pageSize;

  const customersQ = useQuery({
    queryKey: ["customers", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<Customer>>("/customers", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
  });

  const createMut = useMutation({
    mutationFn: async (payload: CustomerForm) => (await api.post<Customer>("/customers", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<CustomerForm> }) =>
      (await api.put<Customer>(`/customers/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/customers/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const columns: GridColDef<Customer>[] = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 220 },
    { field: "phone", headerName: "Phone", width: 160, valueGetter: (v, r) => r.phone ?? "" },
    { field: "email", headerName: "Email", width: 220, valueGetter: (v, r) => r.email ?? "" },
    { field: "address", headerName: "Address", flex: 1, minWidth: 220, valueGetter: (v, r) => r.address ?? "" },
    {
      field: "actions",
      headerName: "Actions",
      width: 220,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => navigate(`/customers/${params.row.id}`)}>
            History
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setError(null);
              setEditing(params.row);
              setForm({
                code: params.row.code,
                name: params.row.name,
                phone: params.row.phone,
                email: params.row.email,
                address: params.row.address,
                notes: params.row.notes,
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
            onClick={() => {
              if (confirm("Delete this customer?")) deleteMut.mutate(params.row.id);
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
    if (editing) updateMut.mutate({ id: editing.id, payload: form });
    else createMut.mutate(form);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Customers"
        subtitle="Manage customer records and search quickly."
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New Customer"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 520 }}>
            <DataGrid
              rows={customersQ.data?.data ?? []}
              columns={columns}
              loading={customersQ.isLoading || customersQ.isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              onRowDoubleClick={(p) => navigate(`/customers/${(p.row as any).id}`)}
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={customersQ.data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField
            label="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
          />
          <TextField
            label="Email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value || null })}
          />
          <TextField
            label="Address"
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value || null })}
          />
          <TextField label="Notes" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
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
