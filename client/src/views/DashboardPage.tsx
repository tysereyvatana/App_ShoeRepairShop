import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { DashboardSummary } from "../lib/types";
import { fmtDate, fmtMoney } from "../lib/format";
import { PageHeader } from "./components/PageHeader";

function KpiCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={900} sx={{ mt: 0.5 }}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {hint}
          </Typography>
        ) : null}
        {onClick ? (
          <Button size="small" sx={{ mt: 1 }} onClick={onClick}>
            View
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status, count }: { status: string; count: number }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
      <Chip size="small" label={status} />
      <Typography fontWeight={900}>{count}</Typography>
    </Box>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await api.get<DashboardSummary>("/dashboard/summary");
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const counts = data?.counts;
  const kpis = data?.kpis;
  const repair = data?.repair;
  const recent = data?.recentOrders ?? [];

  const deliveredTodayLabel = kpis?.deliveredTodayCount != null ? `${kpis.deliveredTodayCount}` : "—";
  const deliveredTodayRevenue = fmtMoney(kpis?.deliveredTodayRevenue ?? "0");
  const unpaidTotal = fmtMoney(kpis?.unpaidTotal ?? "0");
  const unpaidCount = kpis?.unpaidCount ?? 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of repairs, cashflow, and operations."
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" onClick={() => navigate("/service-orders")}>New Ticket</Button>
            <Button variant="outlined" onClick={() => navigate("/repair-board")}>Repair Board</Button>
            <Button variant="outlined" onClick={() => navigate("/reports")}>Reports</Button>
          </Box>
        }
      />

      {error ? (
        <Card>
          <CardContent>
            <Typography color="error">Failed to load dashboard</Typography>
          </CardContent>
        </Card>
      ) : null}

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Payments Today" value={fmtMoney(kpis?.paymentsToday)} hint="Collected from repair tickets" onClick={() => navigate("/income")} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Delivered Today" value={deliveredTodayLabel} hint={`Revenue: ${deliveredTodayRevenue}`} onClick={() => navigate("/repair-board")} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Unpaid Balance" value={unpaidTotal} hint={`${unpaidCount} ticket(s) unpaid/partial`} onClick={() => navigate("/reports")} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard label="Overdue Repairs" value={repair?.overdueRepairs ?? "—"} hint="Past promised date" onClick={() => navigate("/repair-board")} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900}>
                Repair Pipeline
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Current tickets by status
              </Typography>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {[
                  "RECEIVED",
                  "CLEANING",
                  "REPAIRING",
                  "READY",
                  "DELIVERED",
                  "CANCELLED",
                ].map((s) => (
                  <StatusPill key={s} status={s} count={repair?.statusCounts?.[s] ?? 0} />
                ))}
              </Box>

              <Button size="small" sx={{ mt: 1 }} onClick={() => navigate("/repair-board")}>
                Open board
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    Recent Tickets
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Latest activity (sorted by received date)
                  </Typography>
                </Box>
                <Button size="small" variant="outlined" onClick={() => navigate("/service-orders")}>View all</Button>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Received</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recent.map((o) => (
                    <TableRow key={o.id} hover>
                      <TableCell sx={{ fontWeight: 900 }}>{o.code}</TableCell>
                      <TableCell>{o.customer?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          <Chip size="small" label={o.status} />
                          <Chip size="small" variant="outlined" label={o.paymentStatus} />
                        </Box>
                      </TableCell>
                      <TableCell>{fmtDate(o.receivedAt)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900 }}>
                        {fmtMoney(o.balance)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {recent.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          {isLoading ? "Loading…" : "No tickets yet"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900}>
                Inventory & People
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Quick counts
              </Typography>

              <Divider sx={{ my: 1.5 }} />

              <Grid container spacing={2}>
                {[
                  { label: "Materials", value: counts?.items ?? "—", to: "/items" },
                  { label: "Customers", value: counts?.customers ?? "—", to: "/customers" },
                  { label: "Suppliers", value: counts?.suppliers ?? "—", to: "/suppliers" },
                  { label: "Staff", value: counts?.staff ?? "—", to: "/staff" },
                  { label: "Purchases", value: counts?.purchases ?? "—", to: "/purchases" },
                  { label: "Repair Tickets", value: counts?.serviceOrders ?? "—", to: "/service-orders" },
                ].map((c) => (
                  <Grid item xs={12} sm={6} md={4} key={c.label}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          {c.label}
                        </Typography>
                        <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>
                          {c.value}
                        </Typography>
                        <Button size="small" sx={{ mt: 1 }} onClick={() => navigate(c.to)}>
                          Open
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={900}>
                Tips
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Best practice for shoe repair workflow
              </Typography>
              <Divider sx={{ my: 1.5 }} />
              <Typography color="text.secondary">
                Create a repair ticket → add services (labor) and optional parts → mark READY (creates an AR charge) → collect payments → DELIVER when fully paid.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
