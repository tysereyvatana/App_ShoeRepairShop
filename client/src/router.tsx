import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";

import { LoginPage } from "./views/LoginPage";
import { AppShell } from "./views/shell/AppShell";
import { DashboardPage } from "./views/DashboardPage";
import { ItemsPage } from "./views/ItemsPage";
import { CustomersPage } from "./views/CustomersPage";
import { CustomerDetailPage } from "./views/CustomerDetailPage";
import { SuppliersPage } from "./views/SuppliersPage";
import { StaffPage } from "./views/StaffPage";
import { PurchasesPage } from "./views/PurchasesPage";
import { ServiceOrdersPage } from "./views/ServiceOrdersPage";
import { RepairBoardPage } from "./views/RepairBoardPage";
import { RepairServicesPage } from "./views/RepairServicesPage";
import { IncomePage } from "./views/IncomePage";
import { UsersPage } from "./views/UsersPage";
import { ReportsPage } from "./views/ReportsPage";

import { PrintShell } from "./views/print/PrintShell";
import { PrintTagPage } from "./views/print/PrintTagPage";
import { PrintInvoicePage } from "./views/print/PrintInvoicePage";
import { PrintReceipt80Page } from "./views/print/PrintReceipt80Page";
import { PrintReceiptA5Page } from "./views/print/PrintReceiptA5Page";
import { PrintShipping80Page } from "./views/print/PrintShipping80Page";
import { PrintVetPage } from "./views/print/PrintVetPage";
import { PrintBothPage } from "./views/print/PrintBothPage";
import { PrinterTestPage } from "./views/print/PrinterTestPage";
import { PrinterTipsPage } from "./views/print/PrinterTipsPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    ),
  },
  {
    path: "/",
    element: (
      <AuthProvider>
        <Protected>
          <AppShell />
        </Protected>
      </AuthProvider>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "items", element: <ItemsPage /> },
      { path: "customers", element: <CustomersPage /> },
      { path: "customers/:id", element: <CustomerDetailPage /> },
      { path: "suppliers", element: <SuppliersPage /> },
      { path: "staff", element: <StaffPage /> },
      { path: "purchases", element: <PurchasesPage /> },
      { path: "service-orders", element: <ServiceOrdersPage /> },
      { path: "repair-board", element: <RepairBoardPage /> },
      { path: "repair-services", element: <RepairServicesPage /> },
      { path: "income", element: <IncomePage /> },
      { path: "reports", element: <ReportsPage /> },
      {
        path: "users",
        element: (
          <AdminOnly>
            <UsersPage />
          </AdminOnly>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: "/print",
    element: (
      <AuthProvider>
        <Protected>
          <PrintShell />
        </Protected>
      </AuthProvider>
    ),
    children: [
      { path: "tag/:id", element: <PrintTagPage /> },
      { path: "invoice/:id", element: <PrintInvoicePage /> },
      { path: "receipt/:id", element: <PrintReceipt80Page /> },
      { path: "receipt-a5/:id", element: <PrintReceiptA5Page /> },
      { path: "shipping/:id", element: <PrintShipping80Page /> },
      { path: "vet/:id", element: <PrintVetPage /> },
      { path: "both/:id", element: <PrintBothPage /> },
      { path: "test", element: <PrinterTestPage /> },
      { path: "tips", element: <PrinterTipsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
