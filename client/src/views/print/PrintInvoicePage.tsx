import React from "react";
import { useParams } from "react-router-dom";
import { Box, Button, Divider, Typography, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { fmtDate, fmtMoney } from "../../lib/format";
import { clampMinorNonNegative, lineTotalMinor, minorToMajorString, toMinor } from "../../lib/money";

export function PrintInvoicePage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["print-invoice", id],
    enabled: !!id,
    queryFn: async () => (await api.get<ServiceOrder>(`/service-orders/${id}`)).data,
  });

  React.useEffect(() => {
    if (data) setTimeout(() => window.print(), 300);
  }, [data]);

  if (isLoading) return <Typography color="text.secondary">Loading...</Typography>;
  if (!data) return <Typography color="text.secondary">Not found</Typography>;

  const servicesTotalMinor = (data.lines ?? []).reduce((s, l) => s + lineTotalMinor(l.price, l.qty), 0);
  const partsTotalMinor = (data.parts ?? []).reduce((s, p) => s + lineTotalMinor(p.unitPrice, p.qty), 0);
  const paidTotalMinor = (data.payments ?? []).reduce((s, p) => s + toMinor(p.amount), 0);
  const totalMinor = toMinor(data.total);
  const balanceMinor = clampMinorNonNegative(totalMinor - paidTotalMinor);

  const servicesTotal = minorToMajorString(servicesTotalMinor);
  const partsTotal = minorToMajorString(partsTotalMinor);
  const subTotal = minorToMajorString(servicesTotalMinor + partsTotalMinor);
  const paidTotal = minorToMajorString(paidTotalMinor);
  const total = minorToMajorString(totalMinor);
  const balance = minorToMajorString(balanceMinor);

  return (
    <Box>

      <Box className="no-print" sx={{ display: "flex", gap: 1, mb: 2 }}>
        <Button variant="contained" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="outlined" onClick={() => window.close()}>
          Close
        </Button>
      </Box>

      <Box sx={{ border: "1px solid #000", borderRadius: 1, p: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography fontSize={22} fontWeight={900}>
              Shoe Repair Shop
            </Typography>
            <Typography fontSize={12} color="text.secondary">
              Invoice / Receipt
            </Typography>
          </Box>
          <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
            <Typography fontWeight={900}>Invoice: {data.code}</Typography>
            <Typography fontSize={12}>Date: {fmtDate(new Date().toISOString())}</Typography>
            <Typography fontSize={12}>Status: {data.status} • {data.paymentStatus}</Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Box>
            <Typography fontWeight={800}>Customer</Typography>
            <Typography>{data.customer?.name ?? ""}</Typography>
            {data.customer?.phone ? <Typography fontSize={12}>Phone: {data.customer.phone}</Typography> : null}
            {data.customer?.email ? <Typography fontSize={12}>Email: {data.customer.email}</Typography> : null}
          </Box>
          <Box>
            <Typography fontWeight={800}>Shoe</Typography>
            <Typography fontSize={12} color="text.secondary">
              {[data.shoeBrand, data.shoeType, data.shoeSize, data.shoeColor].filter(Boolean).join(" • ")}
              {data.pairCount ? ` • Pair(s): ${data.pairCount}` : ""}
              {data.urgent ? " • URGENT" : ""}
            </Typography>
            {data.promisedAt ? <Typography fontSize={12}>Promised: {fmtDate(data.promisedAt)}</Typography> : null}
          </Box>
        </Box>

        {data.problemDesc ? (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography fontWeight={800}>Notes</Typography>
            <Typography fontSize={12} sx={{ whiteSpace: "pre-wrap" }}>
              {data.problemDesc}
            </Typography>
          </>
        ) : null}

        <Divider sx={{ my: 2 }} />

        <Typography fontWeight={900} sx={{ mb: 1 }}>
          Services
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.lines ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.description}</TableCell>
                <TableCell align="right">{l.qty}</TableCell>
                <TableCell align="right">{fmtMoney(l.price)}</TableCell>
                <TableCell align="right">{fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}</TableCell>
              </TableRow>
            ))}
            {!(data.lines ?? []).length ? (
              <TableRow>
                <TableCell colSpan={4} style={{ color: "#666" }}>
                  (no services)
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Typography fontWeight={900}>Services Total: {fmtMoney(servicesTotal)}</Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography fontWeight={900} sx={{ mb: 1 }}>
          Materials / Parts
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Unit Price</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.parts ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.item?.name ?? ""}</TableCell>
                <TableCell align="right">{p.qty}</TableCell>
                <TableCell align="right">{fmtMoney(p.unitPrice)}</TableCell>
                <TableCell align="right">{fmtMoney(minorToMajorString(lineTotalMinor(p.unitPrice, p.qty)))}</TableCell>
              </TableRow>
            ))}
            {!(data.parts ?? []).length ? (
              <TableRow>
                <TableCell colSpan={4} style={{ color: "#666" }}>
                  (no parts)
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Typography fontWeight={900}>Parts Total: {fmtMoney(partsTotal)}</Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Box>
            <Typography fontWeight={800}>Payments</Typography>
            {(data.payments ?? []).length ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {data.payments.map((p) => (
                  <Typography key={p.id} fontSize={12} color="text.secondary">
                    {fmtDate(p.paidAt)} • {p.method} • {fmtMoney(p.amount)} {p.note ? `• ${p.note}` : ""}
                  </Typography>
                ))}
              </Box>
            ) : (
              <Typography fontSize={12} color="text.secondary">
                (no payments)
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Subtotal</Typography>
              <Typography fontWeight={900}>{fmtMoney(subTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Discount</Typography>
              <Typography fontWeight={900}>{fmtMoney(data.discount)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Total</Typography>
              <Typography fontWeight={900}>{fmtMoney(total)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Paid</Typography>
              <Typography fontWeight={900}>{fmtMoney(paidTotal)}</Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography>Balance</Typography>
              <Typography fontWeight={900}>{fmtMoney(balance)}</Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          <Box>
            <Typography fontSize={12} color="text.secondary">
              Thank you!
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography fontSize={12} color="text.secondary">
              Signature: ______________________
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
