import React from "react";
import { useParams } from "react-router-dom";
import { Box, Button, Divider, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { fmtDate, fmtMoney } from "../../lib/format";
import { clampMinorNonNegative, lineTotalMinor, minorToMajorString, toMinor } from "../../lib/money";
import { SHOP_INFO } from "../../config/shop";

export function PrintReceipt80Page() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["print-receipt-80", id],
    enabled: !!id,
    queryFn: async () => (await api.get<ServiceOrder>(`/service-orders/${id}`)).data,
  });

  React.useEffect(() => {
    if (data) setTimeout(() => window.print(), 250);
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
  const senderName = SHOP_INFO.name;
  const senderPhone = SHOP_INFO.phone;
  const senderAddress = SHOP_INFO.address;
  const logoText = SHOP_INFO.logoText;
  const social = SHOP_INFO.social;

  const receiverName = data.customer?.name ?? "";
  const receiverPhone = data.customer?.phone ?? "";
  const receiverAddress = data.customer?.address ?? "";

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

      <Box className="thermal-paper">
        {/* HEADER */}
        <Box sx={{ textAlign: "center" }}>
          {logoText ? (
            <Typography fontWeight={900} fontSize={16} sx={{ letterSpacing: 2 }}>
              {logoText}
            </Typography>
          ) : null}
          <Typography fontWeight={900} fontSize={14}>
            {senderName}
          </Typography>
          {senderPhone ? (
            <Typography fontSize={11} color="text.secondary">
              {senderPhone}
            </Typography>
          ) : null}
          {senderAddress ? (
            <Typography fontSize={11} color="text.secondary">
              {senderAddress}
            </Typography>
          ) : null}
          <Typography fontSize={11} color="text.secondary">
            Receipt (80mm)
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* TICKET META */}
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
          <Typography fontSize={12} fontWeight={900}>
            {data.code}
          </Typography>
          <Typography fontSize={12}>{fmtDate(new Date().toISOString())}</Typography>
        </Box>

        <Typography fontSize={11} color="text.secondary">
          Status: {data.status} • {data.paymentStatus}
        </Typography>

        {data.promisedAt ? (
          <Typography fontSize={11} color="text.secondary">
            Promised: {fmtDate(data.promisedAt)}
          </Typography>
        ) : null}

        <Divider sx={{ my: 1 }} />

        {/* CUSTOMER */}
        <Typography fontSize={11} fontWeight={800}>
          Customer
        </Typography>
        <Typography fontSize={12}>{receiverName}</Typography>
        {receiverPhone ? (
          <Typography fontSize={11} color="text.secondary">
            Phone: {receiverPhone}
          </Typography>
        ) : null}
        {receiverAddress ? (
          <Typography fontSize={11} color="text.secondary">
            Address: {receiverAddress}
          </Typography>
        ) : null}

        <Divider sx={{ my: 1 }} />

        {/* SERVICES */}
        <Typography fontSize={11} fontWeight={800}>
          Services
        </Typography>
        {(data.lines ?? []).length ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {(data.lines ?? []).map((l) => (
              <Box key={l.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography fontSize={11} sx={{ flex: 1 }}>
                  {l.description} × {l.qty}
                </Typography>
                <Typography fontSize={11} fontWeight={900}>
                  {fmtMoney(minorToMajorString(lineTotalMinor(l.price, l.qty)))}
                </Typography>
              </Box>
            ))}
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 0.25 }}>
              <Typography fontSize={11} color="text.secondary">
                Services Total
              </Typography>
              <Typography fontSize={11} fontWeight={900}>
                {fmtMoney(servicesTotal)}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography fontSize={11} color="text.secondary">
            (no services)
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* PARTS */}
        <Typography fontSize={11} fontWeight={800}>
          Parts
        </Typography>
        {(data.parts ?? []).length ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {(data.parts ?? []).map((p) => (
              <Box key={p.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography fontSize={11} sx={{ flex: 1 }}>
                  {p.item?.name ?? ""} × {p.qty}
                </Typography>
                <Typography fontSize={11} fontWeight={900}>
                  {fmtMoney(minorToMajorString(lineTotalMinor(p.unitPrice, p.qty)))}
                </Typography>
              </Box>
            ))}
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 0.25 }}>
              <Typography fontSize={11} color="text.secondary">
                Parts Total
              </Typography>
              <Typography fontSize={11} fontWeight={900}>
                {fmtMoney(partsTotal)}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography fontSize={11} color="text.secondary">
            (no parts)
          </Typography>
        )}

        <Divider sx={{ my: 1 }} />

        {/* TOTALS */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography fontSize={11}>Subtotal</Typography>
            <Typography fontSize={11} fontWeight={900}>
              {fmtMoney(subTotal)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography fontSize={11}>Discount</Typography>
            <Typography fontSize={11} fontWeight={900}>
              {fmtMoney(data.discount)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography fontSize={11}>Total</Typography>
            <Typography fontSize={11} fontWeight={900}>
              {fmtMoney(total)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography fontSize={11}>Paid</Typography>
            <Typography fontSize={11} fontWeight={900}>
              {fmtMoney(paidTotal)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography fontSize={11}>Balance</Typography>
            <Typography fontSize={11} fontWeight={900}>
              {fmtMoney(balance)}
            </Typography>
          </Box>
        </Box>

        {(data.payments ?? []).length ? (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography fontSize={11} fontWeight={800}>
              Payments
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {data.payments.map((p) => (
                <Typography key={p.id} fontSize={11} color="text.secondary">
                  {fmtDate(p.paidAt)} • {p.method} • {fmtMoney(p.amount)}
                  {p.note ? ` • ${p.note}` : ""}
                </Typography>
              ))}
            </Box>
          </>
        ) : null}

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={11} color="text.secondary" sx={{ textAlign: "center" }}>
          Thank you!
        </Typography>

        {social ? (
          <Typography fontSize={11} color="text.secondary" sx={{ textAlign: "center", mt: 0.5 }}>
            {social}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
