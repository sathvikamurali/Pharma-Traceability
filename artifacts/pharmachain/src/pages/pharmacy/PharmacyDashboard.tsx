import { useState } from "react";
import { useWeb3 } from "@/contexts/Web3Context";
import DashboardLayout from "@/components/DashboardLayout";
import { SenderVerification } from "@/components/SenderVerification";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetBatchMetadata } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  Clock,
  CheckCircle2,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, sectionId: "overview" },
  { label: "Incoming Batches", icon: Clock, sectionId: "incoming" },
  { label: "My Stock", icon: Package, sectionId: "stock" },
];

interface BatchInfo {
  batchId: string;
  ipfsCid: string;
  status: number;
  totalQuantity: bigint;
  manufacturer: string;
  currentHolder: string;
}

function BatchCard({
  batch,
  action,
}: {
  batch: BatchInfo;
  action?: React.ReactNode;
}) {
  const { data: meta, isLoading } = useGetBatchMetadata(batch.ipfsCid, {
    query: {
      enabled: !!batch.ipfsCid,
      queryKey: [`/pharmachain/metadata/${batch.ipfsCid}`] as const,
    },
  });

  return (
    <div
      data-testid={`card-batch-${batch.batchId}`}
      className="p-4 border border-border rounded-lg bg-card hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{batch.batchId}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {isLoading ? "Loading..." : meta?.name || "—"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-xs border shrink-0",
            batch.status === 1
              ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
              : "border-green-500/30 text-green-400 bg-green-500/10"
          )}
        >
          {batch.status === 1 ? "In Transit" : "In Stock"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-3">
        <div>
          <span className="block text-muted-foreground/60">Qty</span>
          <span className="text-foreground font-mono">{batch.totalQuantity.toString()}</span>
        </div>
        <div>
          <span className="block text-muted-foreground/60">Storage</span>
          <span className="text-foreground">{meta?.storageCondition || "—"}</span>
        </div>
        <div>
          <span className="block text-muted-foreground/60">Expiry</span>
          <span className="text-foreground">{meta?.expiryDate || "—"}</span>
        </div>
      </div>
      {meta?.composition && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          <span className="text-muted-foreground/60">Composition: </span>
          {meta.composition}
        </p>
      )}
      {action}
    </div>
  );
}

export default function PharmacyDashboard() {
  const { contract, account } = useWeb3();
  const [activeSection, setActiveSection] = useState("overview");

  const [incomingBatches, setIncomingBatches] = useState<BatchInfo[]>([]);
  const [stockBatches, setStockBatches] = useState<BatchInfo[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);

  const handleLoadBatches = async () => {
    if (!contract || !account) return;
    setIsLoadingBatches(true);
    try {
      const ids: string[] = await contract.getBatchIds();
      const incoming: BatchInfo[] = [];
      const stock: BatchInfo[] = [];

      await Promise.all(
        ids.map(async (id) => {
          const b = await contract.getBatch(id);
          const transfers = await contract.getBatchTransfers(id);
          const pendingForMe = transfers.some(
            (t: any) =>
              t.to.toLowerCase() === account.toLowerCase() && !t.accepted
          );
          const heldByMe =
            b.currentHolder.toLowerCase() === account.toLowerCase();

          if (pendingForMe && Number(b.status) === 1) {
            incoming.push({
              batchId: id,
              ipfsCid: b.ipfsCid,
              status: 1,
              totalQuantity: b.totalQuantity,
              manufacturer: b.manufacturer,
              currentHolder: b.currentHolder,
            });
          } else if (heldByMe && Number(b.status) === 2) {
            stock.push({
              batchId: id,
              ipfsCid: b.ipfsCid,
              status: 2,
              totalQuantity: b.totalQuantity,
              manufacturer: b.manufacturer,
              currentHolder: b.currentHolder,
            });
          }
        })
      );
      setIncomingBatches(incoming);
      setStockBatches(stock);
    } catch {
      toast.error("Failed to load batches");
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const handleAccept = async (batchId: string) => {
    if (!contract) return;
    setAcceptingId(batchId);
    try {
      toast.info("Waiting for MetaMask...");
      const tx = await contract.acceptFromDistributor(batchId);
      toast.info("Confirming...");
      await tx.wait();
      toast.success(`Batch ${batchId} accepted into stock`);
      handleLoadBatches();
    } catch (err: any) {
      if (err.code === 4001) toast.error("Rejected");
      else toast.error(err.reason || "Failed to accept");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleSell = async (batchId: string) => {
    if (!contract) return;
    setSellingId(batchId);
    try {
      toast.info("Waiting for MetaMask...");
      const tx = await contract.markAsSold(batchId);
      toast.info("Confirming...");
      await tx.wait();
      toast.success(`Batch ${batchId} marked as sold`);
      handleLoadBatches();
    } catch (err: any) {
      if (err.code === 4001) toast.error("Rejected");
      else toast.error(err.reason || "Failed to mark as sold");
    } finally {
      setSellingId(null);
    }
  };

  return (
    <DashboardLayout
      title="Pharmacy Dashboard"
      role="Pharmacy"
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {activeSection === "overview" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Pharmacy Operations</h2>
            <p className="text-sm text-muted-foreground">
              Accept incoming batches and manage your drug inventory
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {navItems.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.sectionId}
                  onClick={() => setActiveSection(item.sectionId)}
                  className="p-5 text-left border border-border rounded-lg bg-card hover:border-primary/30 transition-all group"
                >
                  <div className="w-9 h-9 rounded bg-green-500/15 flex items-center justify-center mb-3 group-hover:bg-green-500/25 transition-colors">
                    <Icon className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">{item.label}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 p-4 border border-border rounded-lg bg-card">
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">Note:</span> When a drug is marked as Sold, the
              QR code on the packaging will display a "Dispensed" warning — preventing reuse of the
              same packaging.
            </p>
          </div>
        </div>
      )}

      {activeSection === "incoming" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">Incoming Batches</h2>
              <p className="text-sm text-muted-foreground">Batches pending your acceptance from distributors</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadBatches}
              disabled={isLoadingBatches}
              data-testid="button-load-incoming"
            >
              {isLoadingBatches ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          {incomingBatches.length === 0 ? (
            <div className="border border-border rounded-lg p-10 text-center text-muted-foreground text-sm">
              {isLoadingBatches ? "Querying blockchain..." : "No incoming batches"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {incomingBatches.map((b) => (
                <BatchCard
                  key={b.batchId}
                  batch={b}
                  action={
                    <div className="space-y-2">
                      {/* ── Verify the distributor BEFORE accepting ──────────────── */}
                      <SenderVerification
                        senderAddress={b.currentHolder}
                        expectedRole="Distributor"
                        batchId={b.batchId}
                      />
                      <Button
                        size="sm"
                        className="w-full gap-2 mt-2"
                        onClick={() => handleAccept(b.batchId)}
                        disabled={acceptingId === b.batchId}
                        data-testid={`button-accept-${b.batchId}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {acceptingId === b.batchId ? "Accepting..." : "Accept into Stock"}
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "stock" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">My Stock</h2>
              <p className="text-sm text-muted-foreground">Drug batches in your inventory</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadBatches}
              disabled={isLoadingBatches}
              data-testid="button-load-stock"
            >
              {isLoadingBatches ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          {stockBatches.length === 0 ? (
            <div className="border border-border rounded-lg p-10 text-center text-muted-foreground text-sm">
              {isLoadingBatches ? "Querying blockchain..." : "No stock. Accept incoming batches first."}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {stockBatches.map((b) => (
                <BatchCard
                  key={b.batchId}
                  batch={b}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 mt-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => handleSell(b.batchId)}
                      disabled={sellingId === b.batchId}
                      data-testid={`button-sell-${b.batchId}`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      {sellingId === b.batchId ? "Processing..." : "Mark as Sold"}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
