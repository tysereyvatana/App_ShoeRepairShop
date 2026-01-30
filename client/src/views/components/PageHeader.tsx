import React from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  search?: string;
  onSearchChange?: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
      <Box>
        <Typography variant="h5" fontWeight={900}>
          {props.title}
        </Typography>
        {props.subtitle ? <Typography color="text.secondary">{props.subtitle}</Typography> : null}
      </Box>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {props.search !== undefined && props.onSearchChange ? (
          <TextField
            label="Search"
            size="small"
            value={props.search}
            onChange={(e) => props.onSearchChange!(e.target.value)}
          />
        ) : null}
        {props.onAdd ? (
          <Button startIcon={<AddIcon />} onClick={props.onAdd}>
            {props.addLabel ?? "Add"}
          </Button>
        ) : null}
        {props.actions ? props.actions : null}
      </Box>
    </Box>
  );
}
