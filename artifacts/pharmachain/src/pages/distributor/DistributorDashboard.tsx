import { useState } from "react";
import { useWeb3 } from "@/contexts/Web3Context";
import DashboardLayout from "@/components/DashboardLayout";
import { SenderVerification } from "@/components/SenderVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGetBatchMetadata, useGenerateQrCode } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  Users,
  ArrowRightLeft,
  QrCode,
  Plus,
  Download,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { ethers } from "ethers";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, sectionId: "overview" },
  { label: "Incoming Batches", icon: Clock, sectionId: "incoming" },
  { label: "My Inventory", icon: Package, sectionId: "inventory" },
  { label: "Pharmacies", icon: Users, sectionId: "pharmacies" },
  { label: "Transfer to Pharmacy", icon: ArrowRightLeft, sectionId: "transfer" },
];

interface BatchInfo {
  batchId: string;
  ipfsCid: string;
  status: number;
  totalQuantity: bigint;
  transferQuantity?: bigint; // The quantity in THIS specific transfer (may differ from totalQuantity)
  manufacturer: string;
  currentHolder: string;
  holderRole: string;
}

function BatchInfoCard({ batch, action }: { batch: BatchInfo; action?: React.ReactNode }) {
  const { data: meta, isLoading } = useGetBatchMetadata(batch.ipfsCid, {
    query: { enabled: !!batch.ipfsCid, queryKey: [`/pharmachain/metadata/${batch.ipfsCid}`] as const },
  });

  return (
    <div data-testid={`card-batch-${batch.batchId}`} className="p-4 border border-border rounded-lg bg-card hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-mono text-muted-foreground">{batch.batchId}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{isLoading ? "Loading..." : (meta?.name || "—")}</p>
        </div>
        <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10 text-xs shrink-0">
          {batch.status === 1 ? "In Transit" : batch.status === 2 ? "Accepted" : "Active"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-3">
        <div><span className="block text-muted-foreground/60">Qty</span><span className="text-foreground font-mono">{(batch.transferQuantity ?? batch.totalQuantity).toString()}</span></div>
        <div><span className="block text-muted-foreground/60">Storage</span><span className="text-foreground">{meta?.storageCondition || "—"}</span></div>
        <div><span className="block text-muted-foreground/60">Expiry</span><span className="text-foreground">{meta?.expiryDate || "—"}</span></div>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        <span className="text-muted-foreground/60">From: </span>
        <span className="font-mono">{batch.manufacturer.slice(0, 10)}...</span>
      </div>
      {action}
    </div>
  );
}

export default function DistributorDashboard() {
  const { contract, account } = useWeb3();
  const [activeSection, setActiveSection] = useState("overview");

  const [incomingBatches, setIncomingBatches] = useState<BatchInfo[]>([]);
  const [inventoryBatches, setInventoryBatches] = useState<BatchInfo[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const [pharmacyAddress, setPharmacyAddress] = useState("");
  const [isAddingPharmacy, setIsAddingPharmacy] = useState(false);
  const [pharmacies, setPharmacies] = useState<string[]>([]);
  const [isLoadingPharmacies, setIsLoadingPharmacies] = useState(false);

  const [transferBatchId, setTransferBatchId] = useState("");
  const [transferPharmacy, setTransferPharmacy] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferQr, setTransferQr] = useState<string | null>(null);
  const [handoffCert, setHandoffCert] = useState<{
    txHash: string; batchId: string; from: string; to: string; quantity: string;
  } | null>(null);

  const generateQrMutation = useGenerateQrCode();

  const handleLoadBatches = async () => {
    if (!contract || !account) return;
    setIsLoadingBatches(true);
    try {
      const ids: string[] = await contract.getBatchIds();
      const incoming: BatchInfo[] = [];
      const inventory: BatchInfo[] = [];

      await Promise.all(
        ids.map(async (id) => {
          const b = await contract.getBatch(id);
          const transfers = await contract.getBatchTransfers(id);
          const pendingForMe = transfers.some(
            (t: any) =>
              t.to.toLowerCase() === account.toLowerCase() && !t.accepted
          );
          const heldByMe = b.currentHolder.toLowerCase() === account.toLowerCase();

          if (pendingForMe && Number(b.status) === 1) {
            // Find the specific transfer record to get exact quantity sent to this distributor
            const myTransfer = transfers.find(
              (t: any) => t.to.toLowerCase() === account.toLowerCase() && !t.accepted
            );
            incoming.push({
              batchId: id, ipfsCid: b.ipfsCid, status: Number(b.status),
              totalQuantity: b.totalQuantity,
              transferQuantity: myTransfer ? myTransfer.quantity : b.totalQuantity,
              manufacturer: b.manufacturer,
              currentHolder: b.currentHolder, holderRole: b.holderRole,
            });
          } else if (heldByMe && Number(b.status) === 2) {
            inventory.push({
              batchId: id, ipfsCid: b.ipfsCid, status: Number(b.status),
              totalQuantity: b.totalQuantity, manufacturer: b.manufacturer,
              currentHolder: b.currentHolder, holderRole: b.holderRole,
            });
          }
        })
      );
      setIncomingBatches(incoming);
      setInventoryBatches(inventory);
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
      const tx = await contract.acceptFromManufacturer(batchId);
      toast.info("Confirming...");
      await tx.wait();
      toast.success(`Batch ${batchId} accepted`);
      handleLoadBatches();
    } catch (err: any) {
      if (err.code === 4001) toast.error("Rejected");
      else toast.error(err.reason || "Failed to accept");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleAddPharmacy = async () => {
    if (!contract) return;
    if (!ethers.isAddress(pharmacyAddress)) { toast.error("Invalid address"); return; }
    setIsAddingPharmacy(true);
    try {
      toast.info("Waiting for MetaMask...");
      const tx = await contract.addPharmacy(pharmacyAddress);
      await tx.wait();
      toast.success("Pharmacy registered");
      setPharmacyAddress("");
    } catch (err: any) {
      if (err.code === 4001) toast.error("Rejected");
      else toast.error(err.reason || "Failed");
    } finally {
      setIsAddingPharmacy(false);
    }
  };

  const handleLoadPharmacies = async () => {
    if (!contract) return;
    setIsLoadingPharmacies(true);
    try {
      const result = await contract.getPharmacies();
      setPharmacies(result as string[]);
    } catch { toast.error("Failed to load"); }
    finally { setIsLoadingPharmacies(false); }
  };

  const handleTransfer = async () => {
    if (!contract) return;
    if (!transferBatchId || !transferPharmacy || !transferQuantity) { toast.error("Fill all fields"); return; }
    if (!ethers.isAddress(transferPharmacy)) { toast.error("Invalid pharmacy address"); return; }
    setIsTransferring(true);
    try {
      toast.info("Waiting for MetaMask...");
      const tx = await contract.transferToPharmacy(transferBatchId, transferPharmacy, BigInt(transferQuantity));
      await tx.wait();
      toast.success("Batch transferred to pharmacy");

      // ── Handoff Certificate with txHash ─────────────────────────────────────
      const qrResult = await generateQrMutation.mutateAsync({
        data: { type: "batch", batchId: transferBatchId, label: `Handoff: ${transferBatchId}` },
      });
      setTransferQr(qrResult.qrCodeDataUrl);
      setHandoffCert({
        txHash: tx.hash,
        batchId: transferBatchId,
        from: account || "",
        to: transferPharmacy,
        quantity: transferQuantity,
      });
      setTransferBatchId(""); setTransferPharmacy(""); setTransferQuantity("");
    } catch (err: any) {
      if (err.code === 4001) toast.error("Rejected");
      else toast.error(err.reason || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <DashboardLayout title="Distributor Dashboard" role="Distributor" navItems={navItems} activeSection={activeSection} onSectionChange={setActiveSection}>
      {activeSection === "overview" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Distributor Operations</h2>
            <p className="text-sm text-muted-foreground">Accept batches, manage pharmacies, and distribute inventory</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {navItems.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.sectionId} onClick={() => setActiveSection(item.sectionId)} className="p-5 text-left border border-border rounded-lg bg-card hover:border-primary/30 transition-all group">
                  <div className="w-9 h-9 rounded bg-purple-500/15 flex items-center justify-center mb-3 group-hover:bg-purple-500/25 transition-colors">
                    <Icon className="w-5 h-5 text-purple-400" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">{item.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeSection === "incoming" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">Incoming Batches</h2>
              <p className="text-sm text-muted-foreground">Batches pending your acceptance</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLoadBatches} disabled={isLoadingBatches} data-testid="button-load-incoming">
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
                <BatchInfoCard key={b.batchId} batch={b} action={
                  <div className="space-y-2">
                    {/* ── Verify the manufacturer BEFORE accepting ────────────────── */}
                    <SenderVerification
                      senderAddress={b.manufacturer}
                      expectedRole="Manufacturer"
                      batchId={b.batchId}
                    />
                    <Button size="sm" className="w-full gap-2 mt-2"
                      onClick={() => handleAccept(b.batchId)}
                      disabled={acceptingId === b.batchId}
                      data-testid={`button-accept-${b.batchId}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {acceptingId === b.batchId ? "Accepting..." : "Accept Batch"}
                    </Button>
                  </div>
                } />
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "inventory" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">My Inventory</h2>
              <p className="text-sm text-muted-foreground">Accepted batches in your possession</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLoadBatches} disabled={isLoadingBatches} data-testid="button-load-inventory">
              {isLoadingBatches ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          {inventoryBatches.length === 0 ? (
            <div className="border border-border rounded-lg p-10 text-center text-muted-foreground text-sm">
              {isLoadingBatches ? "Querying blockchain..." : "No inventory. Accept incoming batches first."}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {inventoryBatches.map((b) => <BatchInfoCard key={b.batchId} batch={b} />)}
            </div>
          )}
        </div>
      )}

      {activeSection === "pharmacies" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Manage Pharmacies</h2>
            <p className="text-sm text-muted-foreground">Register pharmacy wallet addresses on-chain</p>
          </div>
          <Card className="border-border bg-card max-w-lg">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Pharmacy Wallet Address</Label>
                <Input placeholder="0x..." value={pharmacyAddress} onChange={(e) => setPharmacyAddress(e.target.value)} className="font-mono text-sm" data-testid="input-pharmacy-address" />
              </div>
              <Button onClick={handleAddPharmacy} disabled={isAddingPharmacy || !pharmacyAddress} className="w-full gap-2" data-testid="button-add-pharmacy">
                <Plus className="w-4 h-4" />
                {isAddingPharmacy ? "Waiting for MetaMask..." : "Register Pharmacy"}
              </Button>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between max-w-2xl">
            <h3 className="text-sm font-medium">Registered Pharmacies</h3>
            <Button variant="outline" size="sm" onClick={handleLoadPharmacies} disabled={isLoadingPharmacies} data-testid="button-load-pharmacies">
              {isLoadingPharmacies ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          <div className="max-w-2xl space-y-2">
            {pharmacies.map((addr, i) => (
              <div key={addr} data-testid={`row-pharmacy-${i}`} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
                <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}</span>
                <span className="text-xs font-mono text-foreground flex-1 break-all">{addr}</span>
                <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 text-xs">Pharmacy</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "transfer" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Transfer to Pharmacy</h2>
            <p className="text-sm text-muted-foreground">Transfer an accepted batch to a registered pharmacy</p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Batch ID</Label>
                <Input placeholder="BATCH-..." value={transferBatchId} onChange={(e) => setTransferBatchId(e.target.value)} className="font-mono text-sm" data-testid="input-transfer-batchid" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Pharmacy Address</Label>
                <Input placeholder="0x..." value={transferPharmacy} onChange={(e) => setTransferPharmacy(e.target.value)} className="font-mono text-sm" data-testid="input-transfer-pharmacy" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Quantity</Label>
                <Input type="number" placeholder="100" value={transferQuantity} onChange={(e) => setTransferQuantity(e.target.value)} data-testid="input-transfer-quantity" />
              </div>
              <Button onClick={handleTransfer} disabled={isTransferring} className="w-full gap-2" data-testid="button-transfer-pharmacy">
                <ArrowRightLeft className="w-4 h-4" />
                {isTransferring ? "Transferring..." : "Transfer to Pharmacy"}
              </Button>
            </CardContent>
          </Card>
          {handoffCert && transferQr && (
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-purple-400">
                  <CheckCircle2 className="w-4 h-4" /> Handoff Certificate — Show to Pharmacy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <img src={transferQr} alt="Handoff QR" className="w-44 h-44 rounded border border-border bg-white p-1" data-testid="img-transfer-qr" />
                </div>
                <div className="text-xs space-y-2 bg-secondary/50 rounded-lg p-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Batch</span>
                    <span className="font-mono font-semibold">{handoffCert.batchId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Qty Transferred</span>
                    <span className="font-semibold text-purple-400">{handoffCert.quantity} units</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">From (You)</span>
                    <span className="font-mono text-xs break-all">{handoffCert.from}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">To (Pharmacy)</span>
                    <span className="font-mono text-xs break-all">{handoffCert.to}</span>
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Blockchain TX Proof</p>
                  <p className="font-mono text-xs break-all text-foreground">{handoffCert.txHash}</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${handoffCert.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    ↗ Verify on Etherscan (Sepolia)
                  </a>
                </div>
                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => {
                  const a = document.createElement("a"); a.href = transferQr!;
                  a.download = `handoff-${handoffCert.batchId}.png`; a.click();
                }} data-testid="button-download-qr">
                  <Download className="w-4 h-4" /> Download Handoff Certificate QR
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
