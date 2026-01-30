import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { CustomerOverview } from "../lib/types";
import { fmtDate, fmtMoney } from "../lib/format";

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
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

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-overview", id],
    queryFn: async () => {
      const res = await api.get<CustomerOverview>(`/customers/${id}/overview`, { params: { limit: 80 } });
      return res.data;
    },
    enabled: !!id,
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Button variant="outlined" onClick={() => navigate("/customers")}>Back</Button>
        <Typography variant="h5" fontWeight={900} sx={{ flexGrow: 1 }}>
          Customer Profile
        </Typography>
      </Box>

      {error ? <Alert severity="error">Failed to load customer</Alert> : null}

      {isLoading ? (
        <Card>
          <CardContent sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <CircularProgress size={22} />
            <Typography>Loading…</Typography>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
                <Box sx={{ flexGrow: 1, minWidth: 260 }}>
                  <Typography variant="h6" fontWeight={900}>
                    {data.customer.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.customer.phone ?? ""}
                    {data.customer.address ? ` • ${data.customer.address}` : ""}
                  </Typography>
                </Box>
                {data.stats.repeatCustomer ? <Chip label="Repeat Customer" color="success" /> : <Chip label="New" />}
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
            <StatCard label="Tickets" value={data.stats.tickets} />
            <StatCard label="Total Spent" value={fmtMoney(data.stats.totalSpent)} />
            <StatCard label="Total Paid" value={fmtMoney(data.stats.totalPaid)} />
            <StatCard label="Outstanding" value={fmtMoney(data.stats.outstanding)} />
            <StatCard label="Last Visit" value={data.stats.lastVisit ? fmtDate(data.stats.lastVisit) : ""} />
          </Box>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                Recent Tickets
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Click a ticket to open it.
              </Typography>
              <Divider sx={{ my: 1.5 }} />

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ticket</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Paid</TableCell>
                    <TableCell align="right">Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.recentOrders.map((o) => (
                    <TableRow
                      key={o.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => navigate(`/service-orders?open=${encodeURIComponent(o.id)}`)}
                    >
                      <TableCell>
                        <Typography fontWeight={800}>{o.code}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtDate(o.receivedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={700}>{o.status}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {o.paymentStatus}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{fmtMoney(o.total)}</TableCell>
                      <TableCell align="right">{fmtMoney(o.paid)}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={900}>{fmtMoney(o.balance)}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}

                  {data.recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          No tickets.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </Box>
  );
}
