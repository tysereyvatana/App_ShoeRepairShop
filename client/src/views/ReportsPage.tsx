import React from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { CashierReport, ReportSummary } from "../lib/types";
import { fmtDate, fmtMoney } from "../lib/format";
import { PageHeader } from "./components/PageHeader";
import { useNavigate } from "react-router-dom";

type RangeMode = "today" | "week" | "month" | "custom";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalYmd(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function ymdStartIso(ymd: string) {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}

function ymdEndIso(ymd: string) {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return dt.toISOString();
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card sx={{ flex: 1, minWidth: 220 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={800} sx={{ mt: 0.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const [range, setRange] = React.useState<RangeMode>("today");
  const [customFrom, setCustomFrom] = React.useState(() => toLocalYmd(new Date()));
  const [customTo, setCustomTo] = React.useState(() => toLocalYmd(new Date()));
  const [applied, setApplied] = React.useState<{ start: string; end: string } | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    // Reset applied range when leaving custom mode.
    if (range !== "custom") setApplied(null);
  }, [range]);

  const customValid = React.useMemo(() => {
    if (!customFrom || !customTo) return false;
    return ymdStartIso(customFrom) <= ymdEndIso(customTo);
  }, [customFrom, customTo]);

  const effectiveCustom = React.useMemo(() => {
    if (range !== "custom") return null;
    const start = applied?.start ?? ymdStartIso(customFrom);
    const end = applied?.end ?? ymdEndIso(customTo);
    return { start, end };
  }, [range, applied, customFrom, customTo]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", range, effectiveCustom?.start ?? "", effectiveCustom?.end ?? ""],
    queryFn: async () => {
      const params: any = {};
      if (range === "custom") {
        params.start = effectiveCustom?.start;
        params.end = effectiveCustom?.end;
      } else {
        params.range = range;
      }
      const res = await api.get<ReportSummary>("/reports/summary", { params });
      return res.data;
    },
  });

  const {
    data: cashier,
    isLoading: cashierLoading,
    error: cashierError,
    refetch: refetchCashier,
  } = useQuery({
    queryKey: ["reportsCashier", range, effectiveCustom?.start ?? "", effectiveCustom?.end ?? ""],
    queryFn: async () => {
      const params: any = {};
      if (range === "custom") {
        params.start = effectiveCustom?.start;
        params.end = effectiveCustom?.end;
      } else {
        params.range = range;
      }
      const res = await api.get<CashierReport>("/reports/cashier", { params });
      return res.data;
    },
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <PageHeader title="Reports" subtitle="Sales, top services, and unpaid balances." />

      <Card>
        <CardContent sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <ToggleButtonGroup
            value={range}
            exclusive
            onChange={(_e, v) => (v ? setRange(v) : null)}
            size="small"
          >
            <ToggleButton value="today">Today</ToggleButton>
            <ToggleButton value="week">This Week</ToggleButton>
            <ToggleButton value="month">This Month</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>

          {range === "custom" ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <TextField
                size="small"
                type="date"
                label="From"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                size="small"
                type="date"
                label="To"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                size="small"
                variant="contained"
                disabled={!customValid}
                onClick={() => {
                  setApplied({ start: ymdStartIso(customFrom), end: ymdEndIso(customTo) });
                }}
              >
                Apply
              </Button>
            </Box>
          ) : null}

          <Box sx={{ flexGrow: 1 }} />

          <Typography variant="body2" color="text.secondary">
            {data || cashier
              ? `${fmtDate((data ?? cashier)!.range.start)}  →  ${fmtDate((data ?? cashier)!.range.end)}`
              : ""}
          </Typography>

          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              refetch();
              refetchCashier();
            }}
          >
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error ? <Alert severity="error">Failed to load sales report</Alert> : null}
      {cashierError ? <Alert severity="error">Failed to load cashier report</Alert> : null}

      {isLoading || cashierLoading ? (
        <Card>
          <CardContent sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <CircularProgress size={22} />
            <Typography>Loading…</Typography>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            <Kpi label="Net Payments" value={fmtMoney(data.kpis.netPayments)} />
            <Kpi label="Gross Payments" value={fmtMoney(data.kpis.grossPayments)} />
            <Kpi label="Refunds" value={fmtMoney(data.kpis.refunds)} />
            <Kpi label="Orders Received" value={data.kpis.ordersReceived} />
            <Kpi label="Orders Delivered" value={data.kpis.ordersDelivered} />
            <Kpi label="Unpaid Total" value={fmtMoney(data.kpis.unpaidTotal)} />
          </Box>

          {cashier ? (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="h6" fontWeight={800} sx={{ mr: 1 }}>
                  Cashier Summary
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Based on payment / income / expense dates (within selected range)
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button size="small" variant="outlined" onClick={() => refetchCashier()}>
                  Refresh Cashier
                </Button>
              </Box>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 1.25 }}>
                <Kpi label="Payments Net" value={fmtMoney(cashier.kpis.paymentsNet)} />
                <Kpi label="Other Income" value={fmtMoney(cashier.kpis.otherIncome)} />
                <Kpi label="Expenses" value={fmtMoney(cashier.kpis.expenses)} />
                <Kpi label="Net Cash" value={fmtMoney(cashier.kpis.netCash)} />
              </Box>
            </>
          ) : null}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={800}>
                  Top Services
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Based on ticket delivered date (within selected range)
                </Typography>

                <Divider sx={{ my: 1.5 }} />

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Service</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data.topServices ?? []).map((r) => (
                      <TableRow key={r.description}>
                        <TableCell>{r.description}</TableCell>
                        <TableCell align="right">{r.qty}</TableCell>
                        <TableCell align="right">{fmtMoney(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {data.topServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography variant="body2" color="text.secondary">
                            No data
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {cashier ? (
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={800}>
                    Cash by Method
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Breakdown of net inflow per payment method
                  </Typography>
                  <Divider sx={{ my: 1.5 }} />

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Method</TableCell>
                        <TableCell align="right">Gross</TableCell>
                        <TableCell align="right">Refunds</TableCell>
                        <TableCell align="right">Other Income</TableCell>
                        <TableCell align="right">Net Inflow</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cashier.byMethod.map((r) => (
                        <TableRow key={r.method}>
                          <TableCell>
                            <Typography fontWeight={700}>{r.method}</Typography>
                          </TableCell>
                          <TableCell align="right">{fmtMoney(r.paymentsGross)}</TableCell>
                          <TableCell align="right">{fmtMoney(r.paymentsRefunds)}</TableCell>
                          <TableCell align="right">{fmtMoney(r.otherIncome)}</TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={800}>{fmtMoney(r.inflowNet)}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary">
                    Payments count: {cashier.kpis.paymentCount} • Tickets with payments: {cashier.kpis.ticketsWithPayments}
                  </Typography>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={800}>
                  Unpaid Balances
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Latest 50 tickets with balance &gt; 0
                </Typography>

                <Divider sx={{ my: 1.5 }} />

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ticket</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell align="right">Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data.unpaid ?? []).map((u) => (
                      <TableRow
                        key={u.id}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => navigate(`/service-orders?open=${encodeURIComponent(u.id)}`)}
                      >
                        <TableCell>
                          <Typography fontWeight={700}>{u.code}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {fmtDate(u.receivedAt)} • {u.status}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography>{u.customer?.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {u.customer?.phone ?? ""}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={800}>{fmtMoney(u.balance)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.unpaid.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography variant="body2" color="text.secondary">
                            No unpaid tickets 🎉
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Box>
        </>
      ) : null}
    </Box>
  );
}
