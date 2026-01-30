import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Box, Button, Divider, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { fmtDate, fmtMoney } from "../../lib/format";
import { SHOP_INFO } from "../../config/shop";

import "./label_8x10.css";

export function PrintTagPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const copies = React.useMemo(() => {
    const n = Number(sp.get("copies") ?? "1");
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(Math.floor(n), 1), 5);
  }, [sp]);
  const auto = sp.get("auto") !== "0";

  const { data, isLoading } = useQuery({
    queryKey: ["print-tag", id],
    enabled: !!id,
    queryFn: async () => (await api.get<ServiceOrder>(`/service-orders/${id}`)).data,
  });

  React.useEffect(() => {
    // Auto-print when loaded
    if (!data) return;
    if (!auto) return;
    setTimeout(() => window.print(), 300);
  }, [data, auto]);

  if (isLoading) return <Typography color="text.secondary">Loading...</Typography>;
  if (!data) return <Typography color="text.secondary">Not found</Typography>;

  const lines = (data.lines ?? []).slice(0, 1);

  // NOTE: Tag should be minimal (no QR).
  const brandName = SHOP_INFO.name;
  const logoText = SHOP_INFO.logoText;

  const receiverName = data.customer?.name ?? "";
  const receiverPhone = data.customer?.phone ?? "";
  const receiverAddress = data.customer?.address ?? "";

  const Tag: React.FC<{ copyIndex: number }> = ({ copyIndex }) => {
    const copyText =
      copies === 2 ? (copyIndex === 0 ? "SHOP COPY" : "CUSTOMER COPY") : copies > 1 ? `COPY ${copyIndex + 1}/${copies}` : "";

    return (
      <Box sx={{ breakAfter: copyIndex < copies - 1 ? "page" : "auto" }}>
        {copyText ? (
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5 }}>
            <Typography fontSize={10} fontWeight={900} color="text.secondary">
              {copyText}
            </Typography>
          </Box>
        ) : null}

        <Box className="label-paper">
          {/* HEADER (branding only) */}
          <Box sx={{ textAlign: "center" }}>
            {logoText ? (
              <Typography fontWeight={900} fontSize={16} sx={{ letterSpacing: 2 }}>
                {logoText}
              </Typography>
            ) : null}
            <Typography fontWeight={900} fontSize={13}>
              {brandName}
            </Typography>
            <Typography fontSize={11} color="text.secondary">
              Repair Tag
            </Typography>
          </Box>

          {/* <Divider sx={{ my: 1 }} /> */}

          {/* TICKET */}
          <Typography fontWeight={900} fontSize={12}>
            {data.code}
          </Typography>
          <Typography fontSize={10} color="text.secondary">
            Received: {fmtDate(data.receivedAt)}
          </Typography>
          {data.promisedAt ? (
            <Typography fontSize={10} color="text.secondary">
              Promised: {fmtDate(data.promisedAt)}
            </Typography>
          ) : null}
          {data.urgent ? (
            <Typography fontSize={12} fontWeight={900}>
              URGENT
            </Typography>
          ) : null}

          {/* <Divider sx={{ my: 1 }} /> */}

          {/* RECEIVER */}
          <Typography fontWeight={800} fontSize={12}>
            Receiver
          </Typography>
          <Typography fontSize={12} fontWeight={800}>
            {receiverName || "—"}
          </Typography>
          {receiverPhone ? <Typography fontSize={12}>Phone: {receiverPhone}</Typography> : null}
          {receiverAddress ? (
            <Typography fontSize={12} color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
              Address: {receiverAddress}
            </Typography>
          ) : null}

          {/* <Divider sx={{ my: 1 }} /> */}

          {/* SHOE */}
          <Typography fontWeight={800} fontSize={12}>
            Shoe
          </Typography>
          <Typography fontSize={12}>
            {[data.shoeBrand, data.shoeType, data.shoeSize, data.shoeColor].filter(Boolean).join(" • ")}
            {data.pairCount ? ` • Pair(s): ${data.pairCount}` : ""}
          </Typography>

          {/* <Divider sx={{ my: 1 }} /> */}

          {/* SERVICES */}
          <Typography fontWeight={800} fontSize={12}>
            Services
          </Typography>
          {lines.length ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {lines.map((l) => (
                <Typography key={l.id} fontSize={12}>
                  • {l.description} ({l.qty})
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography fontSize={12} color="text.secondary">
              No services yet — add from catalog.
            </Typography>
          )}

          {data.problemDesc ? (
            <>
              {/* <Divider sx={{ my: 1 }} /> */}
              <Typography fontWeight={800} fontSize={12}>
                Notes
              </Typography>
              <Typography fontSize={12} sx={{ whiteSpace: "pre-wrap" }}>
                {data.problemDesc}
              </Typography>
            </>
          ) : null}

          {/* <Divider sx={{ my: 1 }} /> */}

          <Box className="label-row">
            <Typography fontSize={12} fontWeight={900}>
              Total: {fmtMoney(data.total)}
            </Typography>
            <Typography fontSize={12}>Status: {data.status}</Typography>
          </Box>
        </Box>
      </Box>
    );
  };

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

      {Array.from({ length: copies }).map((_, i) => (
        <Tag key={i} copyIndex={i} />
      ))}
    </Box>
  );
}
