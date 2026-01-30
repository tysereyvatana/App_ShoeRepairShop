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
  Checkbox,
  ListItemText,
  Chip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Paged, UserRow } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { useAuth } from "../lib/auth";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type Role = { id: string; name: string };

type Form = {
  username: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  roles: string[];
  password: string;
};

const empty: Form = { username: "", email: "", status: "ACTIVE", roles: [], password: "" };

export function UsersPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [paginationModel, setPaginationModel] = React.useState<GridPaginationModel>({ page: 0, pageSize: 50 });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [form, setForm] = React.useState<Form>(empty);
  const [error, setError] = React.useState<string | null>(null);

  const [pwDialogOpen, setPwDialogOpen] = React.useState(false);
  const [pwUser, setPwUser] = React.useState<UserRow | null>(null);
  const [pw, setPw] = React.useState("");
  const [pwError, setPwError] = React.useState<string | null>(null);

  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<{ data: Role[] }>("/roles")).data.data,
  });

  const page = paginationModel.page + 1;
  const pageSize = paginationModel.pageSize;

    const usersQ = useQuery({
    queryKey: ["users", debouncedSearch, page, pageSize],
    queryFn: async () => {
      const res = await api.get<Paged<UserRow>>("/users", { params: { q: debouncedSearch, page, pageSize } });
      return res.data;
    },
    placeholderData: (prev) => prev,
    staleTime: 5_000,
    enabled: isAdmin,
  });

  const createMut = useMutation({
    mutationFn: async (payload: Form) => (await api.post<UserRow>("/users", payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Form> }) => (await api.put<UserRow>(`/users/${id}`, payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => alert(e?.response?.data?.message ?? "Delete failed"),
  });

  const resetPwMut = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: async () => {
      setPwDialogOpen(false);
      setPw("" );
    },
    onError: (e: any) => setPwError(e?.response?.data?.message ?? "Reset password failed"),
  });

  const columns: GridColDef<UserRow>[] = [
    { field: "username", headerName: "Username", width: 180 },
    { field: "email", headerName: "Email", width: 240, valueGetter: (v, r) => r.email ?? "" },
    { field: "status", headerName: "Status", width: 120 },
    {
      field: "roles",
      headerName: "Roles",
      flex: 1,
      minWidth: 200,
      renderCell: (p) => (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {p.row.roles.map((r) => (
            <Chip key={r} size="small" label={r} />
          ))}
        </Box>
      ),
      sortable: false,
      filterable: false,
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 320,
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
                username: params.row.username,
                email: params.row.email ?? "",
                status: params.row.status,
                roles: params.row.roles,
                password: "",
              });
              setDialogOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setPwError(null);
              setPwUser(params.row);
              setPw("");
              setPwDialogOpen(true);
            }}
          >
            Reset PW
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              if (confirm("Disable (soft-delete) this user?")) deleteMut.mutate(params.row.id);
            }}
          >
            Disable
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

  const save = () => {
    setError(null);
    if (!form.username.trim()) return setError("Username is required");
    if (!editing && form.password.trim().length < 4) return setError("Password must be at least 4 characters");
    if (editing) {
      const payload: Partial<Form> = {
        username: form.username,
        email: form.email || "",
        status: form.status,
        roles: form.roles,
      };
      updateMut.mutate({ id: editing.id, payload });
    } else {
      createMut.mutate(form);
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent>
          <Typography fontWeight={800}>Admin only</Typography>
          <Typography color="text.secondary">You need the ADMIN role to manage users.</Typography>
        </CardContent>
      </Card>
    );
  }

  const roleNames = rolesQ.data?.map((r) => r.name) ?? ["ADMIN", "STAFF"];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Users"
        subtitle="Create users, assign roles, reset passwords. (ADMIN only)"
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        onAdd={openCreate}
        addLabel="New User"
      />

      <Card>
        <CardContent>
          <Box sx={{ height: 560 }}>
            <DataGrid
              rows={usersQ.data?.data ?? []}
              columns={columns}
              loading={usersQ.isLoading || usersQ.isFetching}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              paginationMode="server"
              rowCount={usersQ.data?.total ?? 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
            />
          </Box>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit User" : "New User"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

          {!editing ? (
            <TextField
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          ) : null}

          <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
            <MenuItem value="DISABLED">DISABLED</MenuItem>
          </TextField>

          <TextField
            select
            label="Roles"
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {(selected as string[]).map((v) => (
                    <Chip key={v} size="small" label={v} />
                  ))}
                </Box>
              ),
            }}
            value={form.roles}
            onChange={(e) => setForm({ ...form, roles: typeof e.target.value === "string" ? e.target.value.split(",") : (e.target.value as string[]) })}
          >
            {roleNames.map((r) => (
              <MenuItem key={r} value={r}>
                <Checkbox checked={form.roles.includes(r)} />
                <ListItemText primary={r} />
              </MenuItem>
            ))}
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

      <Dialog open={pwDialogOpen} onClose={() => setPwDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 2 }}>
          {pwError ? <Alert severity="error">{pwError}</Alert> : null}
          <TextField label="User" value={pwUser?.username ?? ""} disabled />
          <TextField label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setPwDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setPwError(null);
              if (!pwUser) return;
              if (pw.trim().length < 4) return setPwError("Password must be at least 4 characters");
              resetPwMut.mutate({ id: pwUser.id, password: pw });
            }}
            disabled={resetPwMut.isPending}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
