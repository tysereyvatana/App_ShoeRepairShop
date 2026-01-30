import { alpha, createTheme } from "@mui/material/styles";

// Windows 11-ish Fluent look: Segoe UI, soft surfaces, rounded corners, subtle blur.
const paperBg = alpha("#FFFFFF", 0.78);
const paperBorder = alpha("#FFFFFF", 0.55);
const shadow = "0px 12px 30px rgba(0,0,0,0.10)";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0F6CBD" }, // Windows 11 accent blue
    secondary: { main: "#5C2D91" },
    background: {
      default: "#F3F4F6",
      paper: paperBg,
    },
    divider: alpha("#000000", 0.08),
    text: {
      primary: "#111827",
      secondary: alpha("#111827", 0.72),
    },
  },
  typography: {
    fontFamily:
      '"Segoe UI Variable","Segoe UI","Segoe UI Emoji",system-ui,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif',
    h5: { fontWeight: 800 },
    h6: { fontWeight: 800 },
    button: { textTransform: "none", fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          margin: 0,
          minHeight: "100vh",
          background:
            "radial-gradient(1200px 600px at 10% 0%, rgba(15,108,189,0.16), transparent 60%)," +
            "radial-gradient(1000px 500px at 90% 20%, rgba(92,45,145,0.10), transparent 60%)," +
            "linear-gradient(180deg, #F7F8FA 0%, #EEF1F5 100%)",
          backgroundAttachment: "fixed",
        },
        "#root": {
          minHeight: "100vh",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${paperBorder}`,
          boxShadow: shadow,
          backdropFilter: "blur(18px) saturate(180%)",
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: alpha("#FFFFFF", 0.78),
          color: "#111827",
          borderBottom: `1px solid ${alpha("#000", 0.06)}`,
          backdropFilter: "blur(18px) saturate(180%)",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha("#FFFFFF", 0.75),
          borderRight: `1px solid ${alpha("#000", 0.06)}`,
          backdropFilter: "blur(18px) saturate(180%)",
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: 14,
          paddingBlock: 9,
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: alpha("#FFFFFF", 0.62),
          backdropFilter: "blur(10px) saturate(180%)",
        },
        notchedOutline: {
          borderColor: alpha("#000", 0.10),
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
        },
      },
    },

    MuiDataGrid: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${alpha("#000", 0.06)}`,
          backgroundColor: alpha("#FFFFFF", 0.65),
          backdropFilter: "blur(18px) saturate(180%)",
        },
        columnHeaders: {
          backgroundColor: alpha("#FFFFFF", 0.65),
          borderBottom: `1px solid ${alpha("#000", 0.06)}`,
        },
      },
    },
  },
});
