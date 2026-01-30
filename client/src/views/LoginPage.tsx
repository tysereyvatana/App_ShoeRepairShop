import React from "react";
import { Box, Button, Card, CardContent, CircularProgress, Container, TextField, Typography, Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, token } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("admin123");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100%", display: "flex", alignItems: "center", bgcolor: "background.default" }}>
      <Container maxWidth="sm">
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" fontWeight={900}>
            Welcome back
          </Typography>
          <Typography color="text.secondary">
            Sign in to manage inventory, customers, and operations.
          </Typography>
        </Box>

        <Card>
          <CardContent>
            <Box component="form" onSubmit={onSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {error ? <Alert severity="error">{error}</Alert> : null}

              <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} fullWidth />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />

              <Button type="submit" size="large" disabled={loading}>
                {loading ? <CircularProgress size={22} /> : "Sign in"}
              </Button>

              <Typography variant="body2" color="text.secondary">
                Default admin: <b>admin</b> / <b>admin123</b>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
