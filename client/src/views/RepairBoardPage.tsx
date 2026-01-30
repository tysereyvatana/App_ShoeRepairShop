import React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  MenuItem,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Paged, ServiceOrder, Staff } from "../lib/types";
import { PageHeader } from "./components/PageHeader";
import { fmtDate, fmtMoney } from "../lib/format";
import { lineTotalMinor, minorToMajorString } from "../lib/money";

const ALL_STATUSES: ServiceOrder["status"][] = ["RECEIVED", "CLEANING", "REPAIRING", "READY", "DELIVERED", "CANCELLED"];
const ACTIVE_STATUSES: ServiceOrder["status"][] = ["RECEIVED", "CLEANING", "REPAIRING", "READY"];

function StatusColor(status: ServiceOrder["status"]) {
  const map: Record<string, any> = {
    RECEIVED: "info",
    CLEANING: "warning",
    REPAIRING: "warning",
    READY: "success",
    DELIVERED: "success",
    CANCELLED: "error",
  };
  return map[status] ?? "default";
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function RepairBoardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Filters (option 1: default show active statuses only)
  const [includeClosed, setIncludeClosed] = React.useState(false);
  const [urgentOnly, setUrgentOnly] = React.useState(false);
  const [dueToday, setDueToday] = React.useState(false);
  const [overdue, setOverdue] = React.useState(false);
  const [staffFilter, setStaffFilter] = React.useState<string>(""); // ""=all, "__unassigned", or staffId
  const [paymentFilter, setPaymentFilter] = React.useState<"" | "UNPAID" | "PARTIAL" | "PAID">("");
  const [dragOverStatus, setDragOverStatus] = React.useState<ServiceOrder["status"] | null>(null);

  const statusesToShow = includeClosed ? ALL_STATUSES : ACTIVE_STATUSES;
  const gridColsLg = `repeat(${statusesToShow.length}, 1fr)`;

  const listQ = useQuery({
    queryKey: ["service-orders", "board", search],
    queryFn: async () => {
      const res = await api.get<Paged<ServiceOrder>>("/service-orders", { params: { q: search, page: 1, pageSize: 200 } });
      return res.data.data;
    },
  });

  const staffQ = useQuery({
    queryKey: ["staff", "board", "__all"],
    queryFn: async () => {
      const res = await api.get<Paged<Staff>>("/staff", { params: { q: "", page: 1, pageSize: 500 } });
      return res.data.data;
    },
  });

  const detailQ = useQuery({
    queryKey: ["service-order", "board", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await api.get<ServiceOrder>(`/service-orders/${selectedId}`);
      return res.data;
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ServiceOrder["status"] }) => (await api.post(`/service-orders/${id}/status`, { status, note: null })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      await qc.invalidateQueries({ queryKey: ["service-orders", "board"] });
      await qc.invalidateQueries({ queryKey: ["service-order", "board", selectedId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Status update failed"),
  });

  const readyMut = useMutation({
    mutationFn: async ({ id, discount }: { id: string; discount?: number }) => (await api.post(`/service-orders/${id}/ready`, { discount: discount ?? 0 })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      await qc.invalidateQueries({ queryKey: ["service-orders", "board"] });
      await qc.invalidateQueries({ queryKey: ["service-order", "board", selectedId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Mark READY failed"),
  });

  const deliverMut = useMutation({
    mutationFn: async ({ id }: { id: string }) => (await api.post(`/service-orders/${id}/deliver`, { note: null })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["service-orders"] });
      await qc.invalidateQueries({ queryKey: ["service-orders", "board"] });
      await qc.invalidateQueries({ queryKey: ["service-order", "board", selectedId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? "Deliver failed"),
  });

  const filtered = React.useMemo(() => {
    const now = new Date();
    const data = listQ.data ?? [];

    return data.filter((o) => {
      // status filter
      if (!includeClosed && (o.status === "DELIVERED" || o.status === "CANCELLED")) return false;

      // urgent filter
      if (urgentOnly && !o.urgent) return false;

      // staff filter
      if (staffFilter === "__unassigned") {
        if (o.assignedStaffId) return false;
      } else if (staffFilter) {
        if (o.assignedStaffId !== staffFilter) return false;
      }

      // payment filter (UNPAID / PARTIAL / PAID)
      if (paymentFilter) {
        if ((o.paymentStatus ?? "UNPAID") !== paymentFilter) return false;
      }

      // due filters (mutually exclusive via UI, but keep logic safe)
      if (dueToday) {
        if (!o.promisedAt) return false;
        const p = new Date(o.promisedAt);
        if (!isSameDay(p, now)) return false;
      }

      if (overdue) {
        if (!o.promisedAt) return false;
        const p = new Date(o.promisedAt);
        if (!(p.getTime() < now.getTime())) return false;
        if (o.status === "DELIVERED" || o.status === "CANCELLED") return false;
      }

      return true;
    });
  }, [includeClosed, urgentOnly, dueToday, overdue, staffFilter, paymentFilter, listQ.data]);

  const grouped = React.useMemo(() => {
    const by: Record<string, ServiceOrder[]> = {};
    for (const s of statusesToShow) by[s] = [];
    for (const o of filtered) by[o.status]?.push(o);

    // Sort inside each column: overdue / urgent first, then by promisedAt, then newest
    const now = new Date();
    for (const s of statusesToShow) {
      by[s] = (by[s] ?? []).sort((a, b) => {
        const aOver = a.promisedAt ? new Date(a.promisedAt).getTime() < now.getTime() : false;
        const bOver = b.promisedAt ? new Date(b.promisedAt).getTime() < now.getTime() : false;
        if (aOver !== bOver) return aOver ? -1 : 1;
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const ap = a.promisedAt ? new Date(a.promisedAt).getTime() : Number.POSITIVE_INFINITY;
        const bp = b.promisedAt ? new Date(b.promisedAt).getTime() : Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
      });
    }

    return by;
  }, [filtered, statusesToShow]);

  const sel = detailQ.data;

  const handleDrop = React.useCallback(
    (id: string, targetStatus: ServiceOrder["status"]) => {
      if (!id) return;
      setError(null);

      const current = (listQ.data ?? []).find((x) => x.id === id);
      if (current && current.status === targetStatus) return;

      // prevent moving closed tickets for now
      if (current && (current.status === "DELIVERED" || current.status === "CANCELLED") && targetStatus !== current.status) {
        setError("Closed tickets can't be moved. (Tip: use Ticket Details actions instead.)");
        return;
      }

      if (targetStatus === "READY") {
        readyMut.mutate({ id, discount: current?.discount ?? 0 });
        return;
      }

      if (targetStatus === "DELIVERED") {
        if ((current?.paymentStatus ?? "UNPAID") !== "PAID") {
          setError("Can't deliver an unpaid ticket. Please complete payment first.");
          return;
        }
        deliverMut.mutate({ id });
        return;
      }

      statusMut.mutate({ id, status: targetStatus });
    },
    [deliverMut, readyMut, statusMut, listQ.data]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Repair Board"
        subtitle="Kanban view of repair tickets by workflow status."
        search={search}
        onSearchChange={setSearch}
      />

      <Card>
        <CardContent sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          <FormControlLabel
            control={<Switch checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />}
            label="Include Closed"
          />
          <FormControlLabel
            control={<Switch checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />}
            label="Urgent Only"
          />
          <FormControlLabel
            control={
              <Switch
                checked={dueToday}
                onChange={(e) => {
                  setDueToday(e.target.checked);
                  if (e.target.checked) setOverdue(false);
                }}
              />
            }
            label="Due Today"
          />
          <FormControlLabel
            control={
              <Switch
                checked={overdue}
                onChange={(e) => {
                  setOverdue(e.target.checked);
                  if (e.target.checked) setDueToday(false);
                }}
              />
            }
            label="Overdue"
          />

          <TextField
            select
            label="Staff"
            size="small"
            sx={{ minWidth: 240 }}
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            helperText={(staffQ.data ?? []).length === 0 && !staffQ.isLoading ? "No staff found (Staff Information)" : ""}
          >
            <MenuItem value="">All staff</MenuItem>
            <MenuItem value="__unassigned">Unassigned</MenuItem>
            {(staffQ.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Payment"
            size="small"
            sx={{ minWidth: 170 }}
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="UNPAID">Unpaid</MenuItem>
            <MenuItem value="PARTIAL">Partial</MenuItem>
            <MenuItem value="PAID">Paid</MenuItem>
          </TextField>

          <Box sx={{ flex: 1 }} />
          <Chip label={`Showing ${filtered.length} ticket(s)`} />
        </CardContent>
      </Card>

      {listQ.isError ? <Alert severity="error">Failed to load tickets. Please make sure you are logged in.</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", lg: gridColsLg },
          gap: 2,
          alignItems: "start",
        }}
      >
        {statusesToShow.map((status) => (
          <Card
            key={status}
            sx={{
              height: "fit-content",
              outline: dragOverStatus === status ? "2px solid" : "none",
              outlineColor: "primary.main",
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDragEnter={() => setDragOverStatus(status)}
            onDragLeave={() => setDragOverStatus((prev) => (prev === status ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              setDragOverStatus(null);
              handleDrop(id, status);
            }}
          >
            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography fontWeight={900}>{status}</Typography>
                <Chip size="small" label={(grouped[status]?.length ?? 0).toString()} />
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {(grouped[status] ?? []).map((o) => (
                  // Drag & drop: drag card to another column to change status
                  <Card
                    key={o.id}
                    variant="outlined"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", o.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragOverStatus(null)}
                    sx={(theme) => {
                      const nowTs = Date.now();
                      const promisedTs = o.promisedAt ? new Date(o.promisedAt).getTime() : null;
                      const isOverdue =
                        promisedTs != null && promisedTs < nowTs && o.status !== "DELIVERED" && o.status !== "CANCELLED";
                      const isUrgent = !!o.urgent && o.status !== "DELIVERED" && o.status !== "CANCELLED";

                      return {
                        cursor: "grab",
                        userSelect: "none",
                        borderColor: isOverdue ? alpha(theme.palette.error.main, 0.35) : undefined,
                        backgroundColor: isOverdue ? alpha(theme.palette.error.main, 0.06) : undefined,
                        boxShadow: isUrgent ? `0px 10px 24px ${alpha(theme.palette.warning.main, 0.18)}` : undefined,
                        "&:hover": { backgroundColor: isOverdue ? alpha(theme.palette.error.main, 0.08) : undefined },
                      };
                    }}
                    onClick={() => {
                      setError(null);
                      setSelectedId(o.id);
                    }}
                  >
                    <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography fontWeight={900} fontSize={13}>
                          {o.code}
                        </Typography>
                        <Chip size="small" color={StatusColor(o.status)} label={o.paymentStatus} />
                      </Box>
                      <Typography fontSize={13} color="text.secondary">
                        {o.customer?.name ?? ""}
                      </Typography>
                      <Typography fontSize={12} color="text.secondary">
                        {[o.shoeBrand, o.shoeType, o.shoeSize].filter(Boolean).join(" • ")}
                      </Typography>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                        <Typography fontSize={12} color="text.secondary">
                          {o.promisedAt ? `Promised: ${fmtDate(o.promisedAt)}` : ""}
                        </Typography>
                        <Typography fontSize={13} fontWeight={900}>
                          {fmtMoney(o.total)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
                        {o.urgent ? <Chip size="small" color="error" label="URGENT" /> : null}
                        {o.assignedStaff?.name ? <Chip size="small" label={`Staff: ${o.assignedStaff.name}`} /> : null}
                      </Box>

                      {/* Quick actions (stopPropagation so card click still opens preview) */}
                      <Box sx={{ display: "flex", gap: 0.75, mt: 0.75, flexWrap: "wrap" }}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/service-orders?open=${o.id}`);
                          }}
                          sx={{ px: 1, minWidth: 0, textTransform: "none" }}
                        >
                          Open
                        </Button>

                        {(o.status !== "DELIVERED" && o.status !== "CANCELLED" && (o.paymentStatus ?? "UNPAID") !== "PAID") ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/service-orders?open=${o.id}`);
                            }}
                            sx={{ px: 1, minWidth: 0, textTransform: "none" }}
                          >
                            Add Payment
                          </Button>
                        ) : null}

                        {(o.status !== "DELIVERED" && o.status !== "CANCELLED" && o.status !== "READY") ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={(e) => {
                              e.stopPropagation();
                              setError(null);
                              readyMut.mutate({ id: o.id, discount: o.discount ?? 0 });
                            }}
                            sx={{ px: 1, minWidth: 0, textTransform: "none" }}
                          >
                            Mark READY
                          </Button>
                        ) : null}

                        {(o.status === "READY" && (o.paymentStatus ?? "UNPAID") === "PAID") ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={(e) => {
                              e.stopPropagation();
                              setError(null);
                              deliverMut.mutate({ id: o.id });
                            }}
                            sx={{ px: 1, minWidth: 0, textTransform: "none" }}
                          >
                            Deliver
                          </Button>
                        ) : null}
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Dialog open={!!selectedId} onClose={() => setSelectedId(null)} fullWidth maxWidth="md">
        <DialogTitle>Ticket</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 2 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {detailQ.isLoading ? <Typography color="text.secondary">Loading...</Typography> : null}
          {sel ? (
            <>
              <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    {sel.code}
                  </Typography>
                  <Typography color="text.secondary">
                    {sel.customer?.name ?? ""} {sel.customer?.phone ? `• ${sel.customer.phone}` : ""}
                  </Typography>
                  <Typography color="text.secondary">{sel.assignedStaff?.name ? `Staff: ${sel.assignedStaff.name}` : "Staff: Unassigned"}</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Chip size="small" color={StatusColor(sel.status)} label={sel.status} />
                  <Chip size="small" label={`Pay: ${sel.paymentStatus}`} />
                  <Typography fontWeight={900}>Total: {fmtMoney(sel.total)}</Typography>
                  <Button variant="outlined" size="small" onClick={() => window.open(`/print/tag/${sel.id}`, "_blank")}>
                    Print Tag
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => window.open(`/print/receipt/${sel.id}`, "_blank")}>
                    Print Receipt
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => window.open(`/print/shipping/${sel.id}?copies=2`, "_blank")}>
                    Print Shipping
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => window.open(`/print/vet/${sel.id}`, "_blank")}>
                    VET Print
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => window.open(`/print/both/${sel.id}`, "_blank")}>
                    Print Both
                  </Button>
                </Box>
              </Box>

              <Divider />

              <Typography fontWeight={800}>Shoe</Typography>
              <Typography color="text.secondary">
                {[sel.shoeBrand, sel.shoeType, sel.shoeSize, sel.shoeColor].filter(Boolean).join(" • ")}
                {sel.pairCount ? ` • Pair(s): ${sel.pairCount}` : ""}
                {sel.urgent ? " • URGENT" : ""}
              </Typography>

              {sel.problemDesc ? (
                <>
                  <Typography fontWeight={800}>Problem</Typography>
                  <Typography color="text.secondary">{sel.problemDesc}</Typography>
                </>
              ) : null}

              <Typography fontWeight={800}>Services</Typography>
              {(sel.lines ?? []).length ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {sel.lines.map((l) => (
                    <Box key={l.id} sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography>
                        {l.description} • {l.qty} × {fmtMoney(l.price)}
                      </Typography>
                      <Typography fontWeight={900}>{fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}</Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">No service lines</Typography>
              )}

              <Divider />

              <Typography fontWeight={800}>Quick Actions</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    if (!selectedId) return;
                    const next =
                      sel.status === "RECEIVED"
                        ? "CLEANING"
                        : sel.status === "CLEANING"
                          ? "REPAIRING"
                          : sel.status === "REPAIRING"
                            ? "READY"
                            : sel.status;
                    if (next === "READY") readyMut.mutate({ id: selectedId });
                    else statusMut.mutate({ id: selectedId, status: next });
                  }}
                  disabled={["READY", "DELIVERED", "CANCELLED"].includes(sel.status)}
                >
                  Move to Next
                </Button>
                <Button
                  variant="contained"
                  disabled={sel.status === "DELIVERED" || sel.status === "CANCELLED" || sel.paymentStatus !== "PAID"}
                  onClick={() => selectedId && deliverMut.mutate({ id: selectedId })}
                >
                  Deliver
                </Button>
                <Button variant="outlined" color="error" onClick={() => selectedId && statusMut.mutate({ id: selectedId, status: "CANCELLED" })}>
                  Cancel
                </Button>
              </Box>
            </>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              if (!selectedId) return;
              const id = selectedId;
              setSelectedId(null);
              navigate(`/service-orders?open=${id}`);
            }}
          >
            Open Full Details
          </Button>
          <Button variant="outlined" onClick={() => setSelectedId(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
