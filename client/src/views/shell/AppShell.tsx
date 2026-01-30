import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Tooltip,
  Avatar,
  Menu,
  MenuItem,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PeopleIcon from "@mui/icons-material/People";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import BadgeIcon from "@mui/icons-material/Badge";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import BuildIcon from "@mui/icons-material/Build";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PaidIcon from "@mui/icons-material/Paid";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AssessmentIcon from "@mui/icons-material/Assessment";

import { useAuth } from "../../lib/auth";

const drawerWidth = 260;

const baseNav = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Reports", path: "/reports", icon: <AssessmentIcon /> },
  { label: "Materials", path: "/items", icon: <Inventory2Icon /> },
  { label: "Customers", path: "/customers", icon: <PeopleIcon /> },
  { label: "Suppliers", path: "/suppliers", icon: <LocalShippingIcon /> },
  { label: "Staff", path: "/staff", icon: <BadgeIcon /> },
  { label: "Purchases", path: "/purchases", icon: <ReceiptLongIcon /> },
  { label: "Repair Board", path: "/repair-board", icon: <ViewKanbanIcon /> },
  { label: "Repair Tickets", path: "/service-orders", icon: <BuildIcon /> },
  { label: "Service Catalog", path: "/repair-services", icon: <ListAltIcon /> },
  { label: "Income", path: "/income", icon: <PaidIcon /> },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();

  const nav = React.useMemo(
    () => (isAdmin ? [...baseNav, { label: "Users", path: "/users", icon: <AdminPanelSettingsIcon /> }] : baseNav),
    [isAdmin]
  );

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="h6" fontWeight={800}>
          Shoe Repair Suite
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Repair tickets & POS
        </Typography>
      </Box>
      <Divider />
      <List sx={{ p: 1 }}>
        {nav.map((n) => {
          const active = n.path === "/" ? location.pathname === "/" : location.pathname.startsWith(n.path);
          return (
            <ListItemButton
              key={n.path}
              onClick={() => {
                navigate(n.path);
                setMobileOpen(false);
              }}
              selected={active}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ p: 2, color: "text.secondary", fontSize: 12 }}>
        v0.1 • Fastify + Prisma • React + MUI
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ display: { md: "none" } }}>
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 800 }}>
            {nav.find((n) => (n.path === "/" ? location.pathname === "/" : location.pathname.startsWith(n.path)))?.label ?? "App"}
          </Typography>

          <Tooltip title={user?.username ?? ""}>
            <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ width: 32, height: 32 }}>{(user?.username ?? "?").slice(0, 1).toUpperCase()}</Avatar>
            </IconButton>
          </Tooltip>

          <Menu anchorEl={anchorEl} open={menuOpen} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>{user?.username}</MenuItem>
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                logout();
                navigate("/login");
              }}
            >
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: drawerWidth } }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" } }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: 8,
          minWidth: 0,
          px: { xs: 1.5, md: 2.5 },
          py: { xs: 1.5, md: 2 },
        }}
      >
        <Box sx={{ maxWidth: 1400, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
