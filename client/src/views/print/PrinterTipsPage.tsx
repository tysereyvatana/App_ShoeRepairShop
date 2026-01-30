import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";

export function PrinterTipsPage() {
  return (
    <Box>
      <Box className="no-print" sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="outlined" onClick={() => window.close()}>
          Close
        </Button>
        <Button variant="text" onClick={() => window.open("/print/test", "_blank")}
        >
          Open Printer Test
        </Button>
      </Box>

      <Box className="thermal-paper">
        <Box sx={{ textAlign: "center" }}>
          <Typography fontWeight={900} fontSize={14}>
            PRINTER TIPS (80mm)
          </Typography>
          <Typography fontSize={11} className="thermal-muted">
            Fix slow/blank prints, margins, and dark backgrounds.
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: 1.25 }}>
            <Typography fontSize={12} fontWeight={900}>
              Recommended settings
            </Typography>
            <List dense sx={{ py: 0 }}>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Browser"
                  secondary="Use Chrome/Edge for thermal printers when possible. Firefox may behave differently on some drivers."
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Paper size"
                  secondary="Set the printer/paper size to 80mm (or 'Receipt 80mm')."
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Margins"
                  secondary="Set margins to None (0)."
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Scale"
                  secondary="Set scale to 100%. Avoid 'Fit to page'."
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Headers/Footers"
                  secondary="Turn OFF headers/footers in the print dialog."
                />
              </ListItem>
              <ListItem sx={{ py: 0 }}>
                <ListItemText
                  primaryTypographyProps={{ fontSize: 11, fontWeight: 800 }}
                  secondaryTypographyProps={{ fontSize: 10 }}
                  primary="Background graphics"
                  secondary="Usually OFF for thermal receipts. Turn ON only if you need logos/colored blocks."
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={12} fontWeight={900}>
          If printing is slow
        </Typography>
        <List dense sx={{ py: 0 }}>
          <ListItem sx={{ py: 0 }}>
            <ListItemText
              primaryTypographyProps={{ fontSize: 11 }}
              primary="1) Prefer Chrome/Edge."
            />
          </ListItem>
          <ListItem sx={{ py: 0 }}>
            <ListItemText
              primaryTypographyProps={{ fontSize: 11 }}
              primary="2) Use USB connection (more stable than Bluetooth for many printers)."
            />
          </ListItem>
          <ListItem sx={{ py: 0 }}>
            <ListItemText
              primaryTypographyProps={{ fontSize: 11 }}
              primary="3) Update/replace the printer driver (many 80mm printers work best with ESC/POS drivers)."
            />
          </ListItem>
          <ListItem sx={{ py: 0 }}>
            <ListItemText
              primaryTypographyProps={{ fontSize: 11 }}
              primary="4) Disable 'Spool print documents' only if your driver recommends it."
            />
          </ListItem>
        </List>

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={12} fontWeight={900}>
          If the receipt looks clipped
        </Typography>
        <Typography fontSize={11} className="thermal-muted">
          Set margins to 0 and paper size to 80mm. If it still clips, reduce printer density/speed or check the driver’s
          printable width.
        </Typography>

        <Divider sx={{ my: 1 }} />

        <Typography fontSize={12} fontWeight={900}>
          Quick checklist
        </Typography>
        <Typography fontSize={11} className="thermal-muted">
          Open <b>/print/test</b> and confirm: text fits, QR is clear, and there are no extra margins.
        </Typography>

        <Box className="thermal-cut">
          <Typography fontSize={11} className="thermal-muted">
            --- CUT HERE ---
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
