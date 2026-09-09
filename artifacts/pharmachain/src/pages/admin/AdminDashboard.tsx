import { useState } from "react";
import { useWeb3 } from "@/contexts/Web3Context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSystemStats, useGenerateQrCode } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Users,
  QrCode,
  Building2,
  Activity,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ethers } from "ethers";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, sectionId: "overview" },
  { label: "Add Manufacturer", icon: Plus, sectionId: "add-manufacturer" },
  { label: "Manufacturers", icon: Users, sectionId: "manufacturers" },
  { label: "Generate QR", icon: QrCode, sectionId: "qr" },
];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  isLoading,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  isLoading: boolean;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className={cn("w-8 h-8 rounded flex items-center justify-center", color)}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-16 bg-secondary" />
        ) : (
          <p className="text-3xl font-bold font-mono text-foreground">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { contract, account } = useWeb3();
  const [activeSection, setActiveSection] = useState("overview");
  const [manufacturerAddress, setManufacturerAddress] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerLicense, setManufacturerLicense] = useState("");
  const [manufacturerCity, setManufacturerCity] = useState("");
  const [isAddingManufacturer, setIsAddingManufacturer] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [isLoadingManufacturers, setIsLoadingManufacturers] = useState(false);
  const [qrAddress, setQrAddress] = useState("");
  const [qrLabel, setQrLabel] = useState("");
  const [qrResult, setQrResult] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetSystemStats();
  const generateQrMutation = useGenerateQrCode();

  const handleAddManufacturer = async () => {
    if (!contract) { toast.error("Contract not connected"); return; }
    if (!ethers.isAddress(manufacturerAddress)) { toast.error("Invalid Ethereum address"); return; }
    if (!manufacturerName.trim()) { toast.error("Company name is required"); return; }
    setIsAddingManufacturer(true);
    try {
      toast.info("Waiting for MetaMask confirmation...");
      const tx = await contract.addManufacturer(manufacturerAddress);
      toast.info("Transaction submitted, waiting for confirmation...");
      await tx.wait();

      // Save human-readable identity to PostgreSQL
      await fetch("/api/pharmachain/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: manufacturerAddress,
          companyName: manufacturerName.trim(),
          licenseNumber: manufacturerLicense.trim() || undefined,
          role: "Manufacturer",
          city: manufacturerCity.trim() || undefined,
        }),
      });

      toast.success(`Manufacturer "${manufacturerName}" registered successfully`);
      setManufacturerAddress(""); setManufacturerName("");
      setManufacturerLicense(""); setManufacturerCity("");
      refetchStats();
    } catch (err: any) {
      if (err.code === 4001) toast.error("Transaction rejected");
      else toast.error(err.reason || "Failed to add manufacturer");
    } finally {
      setIsAddingManufacturer(false);
    }
  };

  const handleLoadManufacturers = async () => {
    if (!contract) {
      toast.error("Contract not connected");
      return;
    }
    setIsLoadingManufacturers(true);
    try {
      const result = await contract.getManufacturers();
      setManufacturers(result as string[]);
    } catch {
      toast.error("Failed to load manufacturers");
    } finally {
      setIsLoadingManufacturers(false);
    }
  };

  const handleGenerateQr = async () => {
    if (!qrAddress && !ethers.isAddress(qrAddress)) {
      toast.error("Enter a valid wallet address");
      return;
    }
    try {
      const result = await generateQrMutation.mutateAsync({
        data: { type: "identity", walletAddress: qrAddress, role: "Manufacturer", label: qrLabel || undefined },
      });
      setQrResult(result.qrCodeDataUrl);
    } catch {
      toast.error("Failed to generate QR code");
    }
  };

  const handleDownloadQr = () => {
    if (!qrResult) return;
    const a = document.createElement("a");
    a.href = qrResult;
    a.download = `pharmachain-identity-${qrAddress.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <DashboardLayout
      title="Admin Dashboard"
      role="Admin"
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {/* Overview */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">System Overview</h2>
            <p className="text-sm text-muted-foreground">Real-time metrics from the PharmaChain network</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Manufacturers"
              value={stats?.totalManufacturers}
              icon={Building2}
              color="bg-blue-500/15 text-blue-400"
              isLoading={statsLoading}
            />
            <StatCard
              label="Distributors"
              value={stats?.totalDistributors}
              icon={Activity}
              color="bg-purple-500/15 text-purple-400"
              isLoading={statsLoading}
            />
            <StatCard
              label="Pharmacies"
              value={stats?.totalPharmacies}
              icon={Building2}
              color="bg-green-500/15 text-green-400"
              isLoading={statsLoading}
            />
            <StatCard
              label="Drug Batches"
              value={stats?.totalBatches}
              icon={Activity}
              color="bg-teal-500/15 text-teal-400"
              isLoading={statsLoading}
            />
            <StatCard
              label="Transfers"
              value={stats?.totalTransfers}
              icon={Activity}
              color="bg-yellow-500/15 text-yellow-400"
              isLoading={statsLoading}
            />
            <StatCard
              label="Sold"
              value={stats?.totalSold}
              icon={CheckCircle2}
              color="bg-green-500/15 text-green-400"
              isLoading={statsLoading}
            />
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Your Admin Address</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-mono text-muted-foreground break-all">{account}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Manufacturer */}
      {activeSection === "add-manufacturer" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Add Manufacturer</h2>
            <p className="text-sm text-muted-foreground">
              Register a manufacturer wallet address on-chain. This grants the MANUFACTURER_ROLE.
            </p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Manufacturer Wallet Address *</Label>
                <Input id="manufacturer-address" placeholder="0x..." value={manufacturerAddress}
                  onChange={(e) => setManufacturerAddress(e.target.value)}
                  className="font-mono text-sm" data-testid="input-manufacturer-address" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Company Name *</Label>
                  <Input placeholder="e.g. Sun Pharma Ltd." value={manufacturerName}
                    onChange={(e) => setManufacturerName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">License Number</Label>
                  <Input placeholder="e.g. MH-FDA-12345" value={manufacturerLicense}
                    onChange={(e) => setManufacturerLicense(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">City / Location</Label>
                <Input placeholder="e.g. Mumbai" value={manufacturerCity}
                  onChange={(e) => setManufacturerCity(e.target.value)} />
              </div>
              <Button onClick={handleAddManufacturer}
                disabled={isAddingManufacturer || !manufacturerAddress || !manufacturerName}
                className="w-full gap-2" data-testid="button-add-manufacturer">
                <Plus className="w-4 h-4" />
                {isAddingManufacturer ? "Waiting for MetaMask..." : "Register Manufacturer"}
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 rounded p-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-yellow-400 shrink-0" />
            <span>
              This action calls the smart contract and requires gas fees. Ensure the address belongs
              to a trusted pharmaceutical manufacturer.
            </span>
          </div>
        </div>
      )}

      {/* Manufacturers List */}
      {activeSection === "manufacturers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Registered Manufacturers</h2>
              <p className="text-sm text-muted-foreground">All addresses with the MANUFACTURER_ROLE on-chain</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadManufacturers}
              disabled={isLoadingManufacturers}
              data-testid="button-load-manufacturers"
            >
              {isLoadingManufacturers ? "Loading..." : "Load from Chain"}
            </Button>
          </div>

          {manufacturers.length === 0 ? (
            <div className="border border-border rounded-lg p-10 text-center text-muted-foreground text-sm">
              {isLoadingManufacturers
                ? "Querying blockchain..."
                : 'Click "Load from Chain" to fetch registered manufacturers'}
            </div>
          ) : (
            <div className="space-y-2">
              {manufacturers.map((addr, i) => (
                <div
                  key={addr}
                  data-testid={`row-manufacturer-${i}`}
                  className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-mono text-blue-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-foreground break-all">{addr}</p>
                  </div>
                  <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-xs shrink-0">
                    Manufacturer
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate QR */}
      {activeSection === "qr" && (
        <div className="max-w-lg space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Generate Identity QR Code</h2>
            <p className="text-sm text-muted-foreground">
              Create a downloadable QR code for manufacturer identity verification.
            </p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Wallet Address</Label>
                <Input
                  placeholder="0x..."
                  value={qrAddress}
                  onChange={(e) => setQrAddress(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-qr-address"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Label (optional)</Label>
                <Input
                  placeholder="e.g. Pfizer India Ltd."
                  value={qrLabel}
                  onChange={(e) => setQrLabel(e.target.value)}
                  data-testid="input-qr-label"
                />
              </div>
              <Button
                onClick={handleGenerateQr}
                disabled={generateQrMutation.isPending || !qrAddress}
                className="w-full gap-2"
                data-testid="button-generate-qr"
              >
                <QrCode className="w-4 h-4" />
                {generateQrMutation.isPending ? "Generating..." : "Generate QR Code"}
              </Button>
            </CardContent>
          </Card>

          {qrResult && (
            <Card className="border-border bg-card">
              <CardContent className="pt-5 flex flex-col items-center gap-4">
                <img
                  src={qrResult}
                  alt="Identity QR Code"
                  className="w-48 h-48 rounded border border-border"
                  data-testid="img-qr-code"
                />
                {qrLabel && <p className="text-sm font-medium text-foreground">{qrLabel}</p>}
                <p className="text-xs font-mono text-muted-foreground text-center break-all">{qrAddress}</p>
                <Button variant="outline" onClick={handleDownloadQr} className="gap-2 w-full" data-testid="button-download-qr">
                  <Download className="w-4 h-4" />
                  Download QR Code
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
