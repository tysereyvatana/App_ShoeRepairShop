import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ServiceOrder } from "../../lib/types";
import { SHOP_INFO } from "../../config/shop";

import "./vet_8x10.css";

function toVetBoxCode(code: string | undefined | null) {
  const raw = String(code ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 8) digits = digits.slice(-8);
  // If fewer than 8 digits, keep as-is (do not pad with zeros)
  const groups = digits.match(/.{1,2}/g);
  return groups ? groups.join(" ") : digits;
}

function fmtPhone(phone: string | undefined | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";

  // Common Cambodia formats
  if (digits.length === 9)
    return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  if (digits.length === 8)
    return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;

  // Fallback: group by 2 from the end
  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 2) {
    parts.unshift(digits.slice(Math.max(i - 2, 0), i));
  }
  return parts.join(" ");
}

export function PrintVetPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const copies = React.useMemo(() => {
    const n = Number(sp.get("copies") ?? "1");
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(Math.floor(n), 1), 5);
  }, [sp]);
  const auto = sp.get("auto") !== "0";

  const { data, isLoading } = useQuery({
    queryKey: ["print-vet", id],
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

  // Khmer text from template
  const title = "វិមានក្បាលគីប";
  const subtitle = "វិក័យប័ត្រផ្ញើរទំនិញ";
  const senderLabel = "អ្នកផ្ញើរ :";
  const receiverLabel = "ទទួល :";
  const codeLabel = "លេខកូដវីរះប៊ីថាំងផ្ញើរខ្លួនឯង";

  const shopPhone = fmtPhone(SHOP_INFO.phone);
  const customerPhone = fmtPhone(data.customer?.phone);

  // vetCode can be blank (print blank)
  const boxCode = toVetBoxCode((data as any).vetCode);

  const VetLabel: React.FC<{ copyIndex: number }> = ({ copyIndex }) => (
    <Box sx={{ breakAfter: copyIndex < copies - 1 ? "page" : "auto" }}>
      <Box className="vet-paper">
        <div className="vet-title">{title}</div>
        <div className="vet-subtitle">{subtitle}</div>

        <div className="vet-phone-row">
          <span className="vet-klabel">{senderLabel}</span>
          <span className="vet-phone">{shopPhone}</span>
        </div>

        <div className="vet-phone-row">
          <span className="vet-klabel">{receiverLabel}</span>
          <span className="vet-phone">{customerPhone}</span>
        </div>

        {/* Location from Address (blank if empty) */}
        <div className="vet-location">
          <div>{(data.customer?.address ?? "").trim()}</div>
        </div>

        <div className="vet-code-label">{codeLabel}</div>

        <div className="vet-box">
          <div className="vet-box-text">{boxCode}</div>
        </div>
      </Box>
    </Box>
  );

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
        <VetLabel key={i} copyIndex={i} />
      ))}
    </Box>
  );
}
