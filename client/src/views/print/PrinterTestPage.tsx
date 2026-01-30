import React from "react";
import { Box, Button, Divider, Typography } from "@mui/material";
export function PrinterTestPage() {
  React.useEffect(() => {
    // auto-print for quick calibration
    setTimeout(() => window.print(), 250);
  }, []);

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

      <Box
        className="no-print"
        sx={{
          mb: 2,
          p: 1.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
        }}
      >
        <Typography fontWeight={900} fontSize={12}>
          Printer settings tips
        </Typography>
        <Typography fontSize={11} color="text.secondary">
          <b>Chrome:</b> Print → More settings → Margins: <b>None</b>, Scale: <b>100%</b>, turn off Headers/Footers, and enable Background graphics.
        </Typography>
        <Typography fontSize={11} color="text.secondary">
          <b>Firefox:</b> Print → Page Setup / More settings → Margins: <b>0</b> (or Minimum), Scale: <b>100%</b>, and enable Print backgrounds.
        </Typography>
        <Typography fontSize={11} color="text.secondary">
          If the receipt looks too small/large, adjust Scale (95–105%) until it fits your 80mm paper.
        </Typography>
      </Box>

      <Box className="thermal-paper">
        <Box className="thermal-center">
          <Typography fontWeight={900} fontSize={14}>
            PRINTER TEST (80mm)
          </Typography>
          <Typography fontSize={11} className="thermal-muted">
            Use this page to check margins and alignment.
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={11} fontWeight={800}>
          Width Check
        </Typography>
        <Typography fontSize={11} className="thermal-muted">
          1234567890123456789012345678901234567890123456789012345678901234
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={11} fontWeight={800}>
          Two-Column Alignment
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.3 }}>
          <Box className="thermal-row">
            <Typography fontSize={11} sx={{ flex: 1 }}>
              Item A × 1
            </Typography>
            <Typography fontSize={11} fontWeight={900}>
              KHR 1,000
            </Typography>
          </Box>
          <Box className="thermal-row">
            <Typography fontSize={11} sx={{ flex: 1 }}>
              Item B × 2
            </Typography>
            <Typography fontSize={11} fontWeight={900}>
              KHR 2,000
            </Typography>
          </Box>
          <Box className="thermal-row">
            <Typography fontSize={11} sx={{ flex: 1 }}>
              Long description item name to test wrapping × 3
            </Typography>
            <Typography fontSize={11} fontWeight={900}>
              KHR 30,000
            </Typography>
          </Box>
        </Box>
        <Box className="thermal-cut">
          <Typography fontSize={11} className="thermal-muted">
            --- CUT HERE ---
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
