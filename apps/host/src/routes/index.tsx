import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppLayout } from "../layout/AppLayout";
import { RemoteBoundary } from "../layout/RemoteBoundary";

const PortfolioPanel = lazy(() => import("remote_portfolio/Panel"));
const TradingPanel = lazy(() => import("remote_trading/Panel"));

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/portfolio" replace />} />
        <Route
          path="portfolio"
          element={
            <RemoteBoundary name="Portfolio">
              <PortfolioPanel />
            </RemoteBoundary>
          }
        />
        <Route
          path="trade"
          element={
            <RemoteBoundary name="Trading">
              <TradingPanel />
            </RemoteBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/portfolio" replace />} />
      </Route>
    </Routes>
  );
}
