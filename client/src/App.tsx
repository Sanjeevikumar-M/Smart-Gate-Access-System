import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import {
  AccessLogsPage,
  AnalyticsPage,
  DashboardPage,
  DevicePage,
  IdentityDirectoryPage,
  ReportPage,
  ReportPreviewPage,
  SecurityAlertsPage,
  SettingsPage,
  SimulatorPage,
} from "./pages/GatePages";

function ProtectedPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/dashboard"><ProtectedPage><DashboardPage /></ProtectedPage></Route>
    <Route path="/users"><ProtectedPage><IdentityDirectoryPage /></ProtectedPage></Route>
    <Route path="/access-logs"><ProtectedPage><AccessLogsPage /></ProtectedPage></Route>
    <Route path="/security-alerts"><ProtectedPage><SecurityAlertsPage /></ProtectedPage></Route>
    <Route path="/devices"><ProtectedPage><DevicePage /></ProtectedPage></Route>
    <Route path="/analytics"><ProtectedPage><AnalyticsPage /></ProtectedPage></Route>
    <Route path="/simulator"><ProtectedPage><SimulatorPage /></ProtectedPage></Route>
    <Route path="/settings"><ProtectedPage><SettingsPage /></ProtectedPage></Route>
    <Route path="/report"><ProtectedPage><ReportPage /></ProtectedPage></Route>
    <Route path="/report/preview"><ProtectedPage><ReportPreviewPage /></ProtectedPage></Route>
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
