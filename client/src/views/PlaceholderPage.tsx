import React from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" fontWeight={900}>
        {title}
      </Typography>
      <Card>
        <CardContent>
          <Typography fontWeight={800}>UI scaffold ready</Typography>
          <Typography color="text.secondary">
            This module is scaffolded. Copy the pattern from <b>Items</b> or <b>Customers</b> to build full CRUD + Search.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
