import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Web3Provider } from "@/contexts/Web3Context";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import ManufacturerDashboard from "@/pages/manufacturer/ManufacturerDashboard";
import DistributorDashboard from "@/pages/distributor/DistributorDashboard";
import PharmacyDashboard from "@/pages/pharmacy/PharmacyDashboard";
import VerifyBatch from "@/pages/verify/VerifyBatch";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/manufacturer" component={ManufacturerDashboard} />
      <Route path="/distributor" component={DistributorDashboard} />
      <Route path="/pharmacy" component={PharmacyDashboard} />
      <Route path="/verify/:batchId" component={VerifyBatch} />
      <Route path="/verify" component={VerifyBatch} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Web3Provider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "hsl(222 47% 13%)",
                border: "1px solid hsl(215 28% 20%)",
                color: "hsl(210 40% 98%)",
              },
            }}
          />
        </Web3Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
