import React, { createContext, useContext, useMemo, useState } from "react";
import { api } from "./api";
import type { UserInfo } from "./types";

type AuthState = {
  token: string | null;
  user: UserInfo | null;
};

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<UserInfo | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as UserInfo) : null;
  });

  const login = async (username: string, password: string) => {
    const res = await api.post("/auth/login", { username, password });
    const { token, user } = res.data as { token: string; user: UserInfo };

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const isAdmin = !!user?.roles?.includes("ADMIN");

  const value = useMemo(() => ({ token, user, login, logout, isAdmin }), [token, user, isAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
