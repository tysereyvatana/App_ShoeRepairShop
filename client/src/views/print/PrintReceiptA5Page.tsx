import React from "react";
import { useParams } from "react-router-dom";
import { Box, Button, Divider, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { fmtDate, fmtMoney } from "../../lib/format";
import { clampMinorNonNegative, lineTotalMinor, minorToMajorString, toMinor } from "../../lib/money";
import { SHOP_INFO } from "../../config/shop";

import "./receipt_a5.css";

export function PrintReceiptA5Page() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["print-receipt-a5", id],
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

  const now = new Date().toISOString();

  const logoText = SHOP_INFO.logoText;
  const shopName = SHOP_INFO.name;
  const shopPhone = SHOP_INFO.phone;
  const shopAddress = SHOP_INFO.address;
  const social = SHOP_INFO.social;

  const customerName = data.customer?.name ?? "";
  const customerPhone = data.customer?.phone ?? "";
  const customerAddress = data.customer?.address ?? "";

  const staffName = data.assignedStaff?.name ?? "";

  const shoeLine = [data.shoeBrand, data.shoeType, data.shoeSize, data.shoeColor]
    .filter(Boolean)
    .join(" • ");

  return (
    <Box>
      <Box className="no-print" sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="outlined" onClick={() => window.close()}>
          Close
        </Button>
      </Box>

      <Box className="a5-paper">
        {/* Header */}
        <Box className="a5-header">
          <Box>
            {logoText ? <div className="a5-logo">{logoText}</div> : null}
            <div className="a5-shop">{shopName}</div>
            {shopPhone ? <div className="a5-muted">{shopPhone}</div> : null}
            {shopAddress ? <div className="a5-muted">{shopAddress}</div> : null}
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <div className="a5-title">Receipt</div>
            <div className="a5-muted">
              No: <span className="a5-strong">{data.code}</span>
            </div>
            <div className="a5-muted">Printed: {fmtDate(now)}</div>
          </Box>
        </Box>

        <div className="a5-divider" />

        {/* Meta */}
        <Box className="a5-grid">
          <Box>
            <div className="a5-section-title">Customer</div>
            <div className="a5-strong">{customerName || "—"}</div>
            {customerPhone ? <div className="a5-muted">Phone: {customerPhone}</div> : <div className="a5-muted">Phone: —</div>}
            {customerAddress ? <div className="a5-muted">Address: {customerAddress}</div> : <div className="a5-muted">Address: —</div>}
          </Box>
          <Box>
            <div className="a5-section-title">Ticket</div>
            <div className="a5-muted">Received: {fmtDate(data.receivedAt)}</div>
            {data.promisedAt ? <div className="a5-muted">Promised: {fmtDate(data.promisedAt)}</div> : <div className="a5-muted">Promised: —</div>}
            <div className="a5-muted">
              Status: <span className="a5-strong">{data.status}</span> • <span className="a5-strong">{data.paymentStatus}</span>
            </div>
            {staffName ? <div className="a5-muted">Staff: {staffName}</div> : null}
          </Box>
        </Box>

        <div className="a5-divider" />

        {/* Shoe */}
        <Box className="a5-grid">
          <Box>
            <div className="a5-section-title">Shoe</div>
            <div>{shoeLine || "—"}</div>
            <div className="a5-muted">Pair(s): {data.pairCount ?? 0}{data.urgent ? " • URGENT" : ""}</div>
          </Box>
          <Box>
            <div className="a5-section-title">Notes</div>
            <div className="a5-muted a5-note">{data.problemDesc ? data.problemDesc : "—"}</div>
          </Box>
        </Box>

        <div className="a5-divider" />

        {/* Services */}
        <div className="a5-section-title">Services</div>
        <table className="a5-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="a5-right" style={{ width: "12mm" }}>
                Qty
              </th>
              <th className="a5-right" style={{ width: "24mm" }}>
                Price
              </th>
              <th className="a5-right" style={{ width: "28mm" }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {(data.lines ?? []).length ? (
              (data.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="a5-right">{l.qty}</td>
                  <td className="a5-right">{fmtMoney(l.price)}</td>
                  <td className="a5-right">{fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="a5-muted">
                  (no services)
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Parts */}
        <Box sx={{ mt: 2 }}>
          <div className="a5-section-title">Parts</div>
          <table className="a5-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="a5-right" style={{ width: "12mm" }}>
                  Qty
                </th>
                <th className="a5-right" style={{ width: "24mm" }}>
                  Unit
                </th>
                <th className="a5-right" style={{ width: "28mm" }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {(data.parts ?? []).length ? (
                (data.parts ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.item?.name ?? ""}</td>
                    <td className="a5-right">{p.qty}</td>
                    <td className="a5-right">{fmtMoney(p.unitPrice)}</td>
                    <td className="a5-right">{fmtMoney(minorToMajorString(lineTotalMinor(p.unitPrice, p.qty)))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="a5-muted">
                    (no parts)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Box>

        <div className="a5-divider" />

        {/* Totals */}
        <div className="a5-totals">
          <div className="a5-totals-box">
            <div className="a5-total-row">
              <span className="a5-muted">Subtotal</span>
              <strong>{fmtMoney(subTotal)}</strong>
            </div>
            <div className="a5-total-row">
              <span className="a5-muted">Discount</span>
              <strong>{fmtMoney(data.discount)}</strong>
            </div>
            <div className="a5-total-row">
              <span className="a5-strong">Total</span>
              <strong>{fmtMoney(total)}</strong>
            </div>
            <div className="a5-total-row">
              <span className="a5-muted">Paid</span>
              <strong>{fmtMoney(paidTotal)}</strong>
            </div>
            <div className="a5-total-row">
              <span className="a5-strong">Balance</span>
              <strong>{fmtMoney(balance)}</strong>
            </div>
          </div>
        </div>

        {/* Payments */}
        {(data.payments ?? []).length ? (
          <>
            <div className="a5-divider" />
            <div className="a5-section-title">Payments</div>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {(data.payments ?? []).map((p) => (
                <div key={p.id} className="a5-muted">
                  {fmtDate(p.paidAt)} • {p.method} • {fmtMoney(p.amount)}
                  {p.note ? ` • ${p.note}` : ""}
                </div>
              ))}
            </Box>
          </>
        ) : null}

        <Divider sx={{ my: 2 }} />

        {/* Footer */}
        <div className="a5-footer">
          <div>
            <div className="a5-muted">Thank you!</div>
            {social ? <div className="a5-muted">{social}</div> : null}
          </div>
          <div className="a5-sign">
            <div className="a5-muted">Signature</div>
            <div className="a5-muted">__________________________</div>
          </div>
        </div>
      </Box>
    </Box>
  );
}
