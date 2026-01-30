import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Box, Button, Divider, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { fmtDate } from "../../lib/format";
import { SHOP_INFO } from "../../config/shop";

import "./label_8x10.css";

export function PrintShipping80Page() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const copies = React.useMemo(() => {
    const n = Number(sp.get("copies") ?? "1");
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(Math.floor(n), 1), 5);
  }, [sp]);
  const auto = sp.get("auto") !== "0";

  const { data, isLoading } = useQuery({
    queryKey: ["print-shipping", id],
    enabled: !!id,
    queryFn: async () => (await api.get<ServiceOrder>(`/service-orders/${id}`)).data,
  });

  React.useEffect(() => {
    if (!data) return;
    if (!auto) return;
    setTimeout(() => window.print(), 300);
  }, [data, auto]);

  if (isLoading) return <Typography color="text.secondary">Loading...</Typography>;
  if (!data) return <Typography color="text.secondary">Not found</Typography>;

  const senderName = SHOP_INFO.name;
  const senderPhone = SHOP_INFO.phone;
  const logoText = SHOP_INFO.logoText;

  const receiverName = data.customer?.name ?? "";
  const receiverPhone = data.customer?.phone ?? "";
  const receiverAddress = data.customer?.address ?? "";

  const Label: React.FC<{ copyIndex: number }> = ({ copyIndex }) => {
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
          {/* HEADER */}
          <Box sx={{ textAlign: "center" }}>
            {logoText ? (
              <Typography fontWeight={900} fontSize={20} sx={{ letterSpacing: 2 }}>
                {logoText}
              </Typography>
            ) : null}
            <Typography fontWeight={900} fontSize={14}>
              {senderName}
            </Typography>
            <Typography fontSize={11} color="text.secondary">
              Shipping Label
            </Typography>
          </Box>

          <Divider sx={{ my: 1 }} />

          {/* TICKET META */}
          <Typography fontWeight={900} fontSize={12}>
            {data.code}
          </Typography>
          <Typography fontSize={11} color="text.secondary">
            Printed: {fmtDate(new Date().toISOString())}
          </Typography>
          {data.promisedAt ? (
            <Typography fontSize={11} color="text.secondary">
              Promised: {fmtDate(data.promisedAt)}
            </Typography>
          ) : null}

          <Divider sx={{ my: 1 }} />

          {/* SENDER */}
          <Typography fontWeight={800} fontSize={12}>
            Sender
          </Typography>
          <Typography fontSize={16} fontWeight={900}>
            Phone: {senderPhone ? senderPhone : "(missing phone)"}
          </Typography>

          <Divider sx={{ my: 1 }} />

          {/* RECEIVER */}
          <Typography fontWeight={900} fontSize={12}>
            Receiver
          </Typography>
          <Typography fontSize={16} fontWeight={900}>
            {receiverName || "(missing name)"}
          </Typography>
          <Typography fontSize={16}>
            Phone: {receiverPhone ? receiverPhone : "(missing phone)"}
          </Typography>
          <Typography fontSize={20} sx={{ whiteSpace: "pre-wrap" }}>
            Address: {receiverAddress ? receiverAddress : "(missing address)"}
          </Typography>

          <Divider sx={{ my: 1 }} />

          {/* COURIER/TRACKING (blank lines for handwriting) */}
          {/* <Typography fontWeight={800} fontSize={12}>
            Shipping
          </Typography>
          <Typography fontSize={12}>Courier: ______________________________</Typography>
          <Typography fontSize={12}>Tracking: _____________________________</Typography> */}
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
        <Label key={i} copyIndex={i} />
      ))}
    </Box>
  );
}
