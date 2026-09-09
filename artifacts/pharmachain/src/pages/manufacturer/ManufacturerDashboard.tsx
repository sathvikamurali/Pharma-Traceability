import { useState } from "react";
import { useWeb3 } from "@/contexts/Web3Context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useUploadBatchMetadata,
  useGetBatchMetadata,
  useGenerateQrCode,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Users,
  ArrowRightLeft,
  QrCode,
  Download,
  LayoutDashboard,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { ethers } from "ethers";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, sectionId: "overview" },
  { label: "Register Batch", icon: Plus, sectionId: "register-batch" },
  { label: "My Batches", icon: Package, sectionId: "batches" },
  { label: "Distributors", icon: Users, sectionId: "distributors" },
  { label: "Transfer Batch", icon: ArrowRightLeft, sectionId: "transfer" },
];

const statusLabels: Record<number, { label: string; color: string; icon: React.ElementType }> = {
  0: { label: "Active", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle2 },
  1: { label: "In Transit", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  2: { label: "Accepted", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: CheckCircle2 },
  3: { label: "Sold", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: AlertCircle },
};

function generateBatchId() {
  return `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

interface BatchInfo {
  batchId: string;
  ipfsCid: string;
  status: number;
  totalQuantity: bigint;
  registeredAt: bigint;
}

function BatchCard({ batch }: { batch: BatchInfo }) {
  const { data: meta, isLoading } = useGetBatchMetadata(batch.ipfsCid, {
    query: {
      enabled: !!batch.ipfsCid,
      queryKey: [`/pharmachain/metadata/${batch.ipfsCid}`] as const,
    },
  });

  const statusInfo = statusLabels[batch.status] || statusLabels[0];
  const StatusIcon = statusInfo.icon;

  return (
    <div
      data-testid={`card-batch-${batch.batchId}`}
      className="p-4 border border-border rounded-lg bg-card hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-muted-foreground">{batch.batchId}</p>
          {isLoading ? (
            <Skeleton className="h-4 w-32 mt-1 bg-secondary" />
          ) : (
            <p className="text-sm font-semibold text-foreground mt-0.5">{meta?.name || "—"}</p>
          )}
        </div>
        <Badge variant="outline" className={cn("text-xs border shrink-0", statusInfo.color)}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {statusInfo.label}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
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
    </div>
  );
}

export default function ManufacturerDashboard() {
  const { contract, account } = useWeb3();
  const [activeSection, setActiveSection] = useState("overview");

  // Register batch state
  const [batchForm, setBatchForm] = useState({
    name: "",
    expiryDate: "",
    quantity: "",
    composition: "",
    storageCondition: "Room Temperature" as "Hot" | "Cold" | "Room Temperature",
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [packageQr, setPackageQr] = useState<string | null>(null); // QR for drug box
  const [lastRegisteredBatchId, setLastRegisteredBatchId] = useState<string | null>(null);

  // Batches
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  // Distributors
  const [distributorAddress, setDistributorAddress] = useState("");
  const [isAddingDistributor, setIsAddingDistributor] = useState(false);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [isLoadingDistributors, setIsLoadingDistributors] = useState(false);

  // Transfer
  const [transferBatchId, setTransferBatchId] = useState("");
  const [transferDistributor, setTransferDistributor] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferQr, setTransferQr] = useState<string | null>(null);
  // Handoff certificate — for distributor to scan & verify
  const [handoffCert, setHandoffCert] = useState<{
    txHash: string; batchId: string; from: string; to: string; quantity: string; timestamp: number;
  } | null>(null);

  const uploadMutation = useUploadBatchMetadata();
  const generateQrMutation = useGenerateQrCode();

  const handleRegisterBatch = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    if (!batchForm.name || !batchForm.expiryDate || !batchForm.quantity || !batchForm.composition) {
      toast.error("Please fill all fields"); return;
    }
    setIsRegistering(true);
    const batchId = generateBatchId();
    try {
      toast.info("Uploading metadata to IPFS...");
      const ipfsResult = await uploadMutation.mutateAsync({
        data: {
          batchId, name: batchForm.name, expiryDate: batchForm.expiryDate,
          quantity: parseInt(batchForm.quantity), composition: batchForm.composition,
          storageCondition: batchForm.storageCondition, manufacturerAddress: account || "",
        },
      });
      toast.info("Registering on blockchain...");
      const tx = await contract.registerBatch(batchId, ipfsResult.cid, BigInt(batchForm.quantity));
      toast.info("Waiting for confirmation...");
      await tx.wait();
      toast.success(`Batch ${batchId} registered!`);

      // ── Generate Package QR (printed on the physical drug box) ──────────────
      const qrResult = await generateQrMutation.mutateAsync({
        data: { type: "batch", batchId, label: `Package: ${batchId}` },
      });
      setPackageQr(qrResult.qrCodeDataUrl);
      setLastRegisteredBatchId(batchId);
      setBatchForm({ name: "", expiryDate: "", quantity: "", composition: "", storageCondition: "Room Temperature" });
    } catch (err: any) {
      if (err.code === 4001) toast.error("Transaction rejected");
      else toast.error(err.reason || err.message || "Failed to register batch");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLoadBatches = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    setIsLoadingBatches(true);
    try {
      const ids: string[] = await contract.getBatchIds();
      const batchData = await Promise.all(
        ids.map(async (id) => {
          const b = await contract.getBatch(id);
          // Only show batches belonging to current manufacturer
          if (b.manufacturer.toLowerCase() !== account?.toLowerCase()) return null;
          return { batchId: id, ipfsCid: b.ipfsCid, status: Number(b.status), totalQuantity: b.totalQuantity, registeredAt: b.registeredAt };
        })
      );
      setBatches(batchData.filter(Boolean) as BatchInfo[]);
    } catch {
      toast.error("Failed to load batches");
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const handleAddDistributor = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    if (!ethers.isAddress(distributorAddress)) { toast.error("Invalid Ethereum address"); return; }
    setIsAddingDistributor(true);
    try {
      toast.info("Waiting for MetaMask...");
      const tx = await contract.addDistributor(distributorAddress);
      toast.info("Confirming transaction...");
      await tx.wait();
      toast.success("Distributor registered successfully");
      setDistributorAddress("");
    } catch (err: any) {
      if (err.code === 4001) toast.error("Transaction rejected");
      else toast.error(err.reason || "Failed to add distributor");
    } finally {
      setIsAddingDistributor(false);
    }
  };

  const handleLoadDistributors = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    setIsLoadingDistributors(true);
    try {
      const result = await contract.getDistributors();
      setDistributors(result as string[]);
    } catch {
      toast.error("Failed to load distributors");
    } finally {
      setIsLoadingDistributors(false);
    }
  };

  const handleTransfer = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    if (!transferBatchId || !transferDistributor || !transferQuantity) {
      toast.error("Fill all transfer fields");
      return;
    }
    if (!ethers.isAddress(transferDistributor)) { toast.error("Invalid distributor address"); return; }
    setIsTransferring(true);
    try {
      toast.info("Waiting for MetaMask...");
      const ts = Math.floor(Date.now() / 1000);
      const tx = await contract.transferToDistributor(
        transferBatchId, transferDistributor, BigInt(transferQuantity)
      );
      toast.info("Confirming on blockchain...");
      await tx.wait();
      toast.success("Batch transferred successfully");

      // ── Handoff Certificate: QR + txHash for distributor to verify ───────────
      const qrResult = await generateQrMutation.mutateAsync({
        data: { type: "batch", batchId: transferBatchId, label: `Handoff: ${transferBatchId}` },
      });
      setTransferQr(qrResult.qrCodeDataUrl);
      setHandoffCert({
        txHash: tx.hash,
        batchId: transferBatchId,
        from: account || "",
        to: transferDistributor,
        quantity: transferQuantity,
        timestamp: ts,
      });
      setTransferBatchId(""); setTransferDistributor(""); setTransferQuantity("");
    } catch (err: any) {
      if (err.code === 4001) toast.error("Transaction rejected");
      else toast.error(err.reason || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <DashboardLayout
      title="Manufacturer Dashboard"
      role="Manufacturer"
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {activeSection === "overview" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Manufacturer Operations</h2>
            <p className="text-sm text-muted-foreground">Manage drug batches, distributors, and transfers</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {navItems.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.sectionId}
                  onClick={() => setActiveSection(item.sectionId)}
                  className="p-5 text-left border border-border rounded-lg bg-card hover:border-primary/30 hover:bg-card/80 transition-all group"
                >
                  <div className="w-9 h-9 rounded bg-primary/15 flex items-center justify-center mb-3 group-hover:bg-primary/25 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">{item.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeSection === "register-batch" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Register Drug Batch</h2>
            <p className="text-sm text-muted-foreground">Metadata uploaded to IPFS, then recorded on-chain</p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Drug Name</Label>
                <Input placeholder="e.g. Amoxicillin 500mg" value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} data-testid="input-batch-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Expiry Date</Label>
                  <Input type="date" value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} data-testid="input-batch-expiry" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Quantity (units)</Label>
                  <Input type="number" placeholder="500" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })} data-testid="input-batch-quantity" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Composition</Label>
                <Textarea placeholder="Active ingredients and formulation details..." value={batchForm.composition} onChange={(e) => setBatchForm({ ...batchForm, composition: e.target.value })} rows={3} data-testid="input-batch-composition" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Storage Condition</Label>
                <Select value={batchForm.storageCondition} onValueChange={(v) => setBatchForm({ ...batchForm, storageCondition: v as "Hot" | "Cold" | "Room Temperature" })}>
                  <SelectTrigger data-testid="select-storage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Room Temperature">Room Temperature</SelectItem>
                    <SelectItem value="Cold">Cold (2-8°C)</SelectItem>
                    <SelectItem value="Hot">Hot Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleRegisterBatch} disabled={isRegistering} className="w-full gap-2" data-testid="button-register-batch">
                <Plus className="w-4 h-4" />
                {isRegistering ? "Registering..." : "Register Batch"}
              </Button>
            </CardContent>
          </Card>

          {/* ── Package QR — printed on the physical drug box ──────────────── */}
          {packageQr && lastRegisteredBatchId && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                  <QrCode className="w-4 h-4" /> Package QR — Print on Drug Box
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <img src={packageQr} alt="Package QR" className="w-44 h-44 rounded border border-border bg-white p-1" />
                <p className="text-xs text-muted-foreground text-center">
                  Consumers scan this QR to verify drug authenticity on the blockchain.
                </p>
                <p className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {lastRegisteredBatchId}
                </p>
                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => {
                  const a = document.createElement("a"); a.href = packageQr!;
                  a.download = `package-qr-${lastRegisteredBatchId}.png`; a.click();
                }}>
                  <Download className="w-4 h-4" /> Download Package QR
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeSection === "batches" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-1">My Drug Batches</h2>
              <p className="text-sm text-muted-foreground">All batches registered by your address</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLoadBatches} disabled={isLoadingBatches} data-testid="button-load-batches">
              {isLoadingBatches ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          {batches.length === 0 ? (
            <div className="border border-border rounded-lg p-10 text-center text-muted-foreground text-sm">
              {isLoadingBatches ? "Querying blockchain..." : "No batches loaded. Click Load from Chain."}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {batches.map((b) => <BatchCard key={b.batchId} batch={b} />)}
            </div>
          )}
        </div>
      )}

      {activeSection === "distributors" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Manage Distributors</h2>
            <p className="text-sm text-muted-foreground">Register distributor wallet addresses on-chain</p>
          </div>
          <Card className="border-border bg-card max-w-lg">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Distributor Wallet Address</Label>
                <Input placeholder="0x..." value={distributorAddress} onChange={(e) => setDistributorAddress(e.target.value)} className="font-mono text-sm" data-testid="input-distributor-address" />
              </div>
              <Button onClick={handleAddDistributor} disabled={isAddingDistributor || !distributorAddress} className="w-full gap-2" data-testid="button-add-distributor">
                <Plus className="w-4 h-4" />
                {isAddingDistributor ? "Waiting for MetaMask..." : "Register Distributor"}
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between max-w-2xl">
            <h3 className="text-sm font-medium text-foreground">Registered Distributors</h3>
            <Button variant="outline" size="sm" onClick={handleLoadDistributors} disabled={isLoadingDistributors} data-testid="button-load-distributors">
              {isLoadingDistributors ? "Loading..." : "Load from Chain"}
            </Button>
          </div>
          <div className="max-w-2xl space-y-2">
            {distributors.map((addr, i) => (
              <div key={addr} data-testid={`row-distributor-${i}`} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
                <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}</span>
                <span className="text-xs font-mono text-foreground flex-1 break-all">{addr}</span>
                <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 text-xs">Distributor</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "transfer" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Transfer Batch to Distributor</h2>
            <p className="text-sm text-muted-foreground">Transfer ownership of a batch. A handoff QR will be generated.</p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Batch ID</Label>
                <Input placeholder="BATCH-..." value={transferBatchId} onChange={(e) => setTransferBatchId(e.target.value)} className="font-mono text-sm" data-testid="input-transfer-batchid" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Distributor Address</Label>
                <Input placeholder="0x..." value={transferDistributor} onChange={(e) => setTransferDistributor(e.target.value)} className="font-mono text-sm" data-testid="input-transfer-distributor" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Quantity to Transfer</Label>
                <Input type="number" placeholder="200" value={transferQuantity} onChange={(e) => setTransferQuantity(e.target.value)} data-testid="input-transfer-quantity" />
              </div>
              <Button onClick={handleTransfer} disabled={isTransferring} className="w-full gap-2" data-testid="button-transfer-batch">
                <ArrowRightLeft className="w-4 h-4" />
                {isTransferring ? "Transferring..." : "Transfer Batch"}
              </Button>
            </CardContent>
          </Card>

          {/* ── Handoff Certificate — show to distributor to prove transfer ── */}
          {handoffCert && transferQr && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-4 h-4" /> Handoff Certificate — Show to Distributor
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
                    <span className="font-semibold text-green-400">{handoffCert.quantity} units</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">From (You)</span>
                    <span className="font-mono text-xs break-all">{handoffCert.from}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">To (Distributor)</span>
                    <span className="font-mono text-xs break-all">{handoffCert.to}</span>
                  </div>
                </div>
                {/* TX Hash — blockchain proof of transfer */}
                <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Blockchain TX Proof</p>
                  <p className="font-mono text-xs break-all text-foreground">{handoffCert.txHash}</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${handoffCert.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    ↗ Verify on Etherscan (Sepolia)
                  </a>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Distributor scans QR or enters TX hash to confirm this transfer is authentic.
                </p>
                <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => {
                  const a = document.createElement("a"); a.href = transferQr!;
                  a.download = `handoff-${handoffCert.batchId}.png`; a.click();
                }} data-testid="button-download-transfer-qr">
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
