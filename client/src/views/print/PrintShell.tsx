import React from "react";
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";

import "./thermal.css";

export function PrintShell() {
  return (
    <Box className="thermal-shell">
      <Outlet />
    </Box>
  );
}
