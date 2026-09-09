import { useEffect } from "react";
import { useLocation } from "wouter";
import { useWeb3 } from "@/contexts/Web3Context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Zap,
  Lock,
  Globe,
  QrCode,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Shield,
    title: "Tamper-Proof Records",
    description: "Every handoff is permanently recorded on Ethereum. Immutable by design.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Lock,
    title: "Role-Based Access",
    description: "Strict RBAC enforced on-chain. Admin, Manufacturer, Distributor, Pharmacy.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Globe,
    title: "IPFS Storage",
    description: "Drug metadata pinned to IPFS via Pinata. Decentralized and always available.",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
  },
  {
    icon: QrCode,
    title: "QR Verification",
    description: "Consumers scan QR codes to verify drug authenticity. No wallet required.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
];

const steps = [
  { label: "Admin onboards Manufacturer", role: "Admin" },
  { label: "Manufacturer registers drug batch to IPFS + blockchain", role: "Manufacturer" },
  { label: "Batch transferred to Distributor", role: "Manufacturer" },
  { label: "Distributor accepts and transfers to Pharmacy", role: "Distributor" },
  { label: "Pharmacy dispenses and marks as sold", role: "Pharmacy" },
  { label: "Consumer scans QR to verify authenticity", role: "Consumer" },
];

const roleColors: Record<string, string> = {
  Admin: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Manufacturer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Distributor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Pharmacy: "bg-green-500/20 text-green-400 border-green-500/30",
  Consumer: "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

export default function Landing() {
  const { account, role, isConnecting, connectWallet, isWrongNetwork, contractDeployed } =
    useWeb3();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (account && role && role !== "None") {
      const routeMap: Record<string, string> = {
        Admin: "/admin",
        Manufacturer: "/manufacturer",
        Distributor: "/distributor",
        Pharmacy: "/pharmacy",
      };
      const route = routeMap[role];
      if (route) {
        setLocation(route);
      }
    }
  }, [account, role, setLocation]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-wider text-sm">PHARMACHAIN</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/verify"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Verify Drug
            </a>
            <Button
              size="sm"
              onClick={connectWallet}
              disabled={isConnecting}
              data-testid="button-connect-wallet"
            >
              {isConnecting ? (
                "Connecting..."
              ) : account ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  {account.slice(0, 6)}...{account.slice(-4)}
                </>
              ) : (
                <>
                  <Wallet className="w-3.5 h-3.5 mr-1" />
                  Connect Wallet
                </>
              )}
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Badge
            variant="outline"
            className="mb-6 text-xs border-primary/30 text-primary bg-primary/10"
          >
            <Zap className="w-3 h-3 mr-1" />
            Ethereum Sepolia Testnet
          </Badge>

          <h1 className="text-4xl lg:text-6xl font-bold tracking-tight text-foreground mb-5 leading-tight">
            Pharmaceutical Supply Chain
            <span className="block text-primary">on the Blockchain</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            PharmaChain creates a tamper-proof, publicly verifiable ledger for every drug batch
            from factory to pharmacy. Counterfeit medicines cannot survive on-chain verification.
          </p>

          {/* Status alerts */}
          {!contractDeployed && (
            <div className="mb-6 max-w-md mx-auto flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Contract not deployed yet. Deploy the smart contract and set the address to enable full functionality.</span>
            </div>
          )}

          {isWrongNetwork && (
            <div className="mb-6 max-w-md mx-auto flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Wrong network detected. Please switch to Sepolia testnet in MetaMask.</span>
            </div>
          )}

          {account && role === "None" && (
            <div className="mb-6 max-w-md mx-auto space-y-3">
              <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Wallet{" "}
                  <span className="font-mono text-xs text-yellow-300">
                    {account.slice(0, 10)}...
                  </span>{" "}
                  has no detected role. If you are the deployer, click a dashboard below.
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Admin", path: "/admin", color: "border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10" },
                  { label: "Manufacturer", path: "/manufacturer", color: "border-blue-500/40 text-blue-400 hover:bg-blue-500/10" },
                  { label: "Distributor", path: "/distributor", color: "border-purple-500/40 text-purple-400 hover:bg-purple-500/10" },
                  { label: "Pharmacy", path: "/pharmacy", color: "border-green-500/40 text-green-400 hover:bg-green-500/10" },
                ].map((d) => (
                  <button
                    key={d.path}
                    onClick={() => setLocation(d.path)}
                    className={cn("p-2 rounded border text-xs font-medium transition-colors", d.color)}
                  >
                    Go to {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {!account ? (
              <Button
                size="lg"
                onClick={connectWallet}
                disabled={isConnecting}
                data-testid="button-connect-hero"
                className="gap-2"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? "Connecting..." : "Connect Wallet to Enter"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : role && role !== "None" ? (
              <Button
                size="lg"
                onClick={() => {
                  const routeMap: Record<string, string> = {
                    Admin: "/admin",
                    Manufacturer: "/manufacturer",
                    Distributor: "/distributor",
                    Pharmacy: "/pharmacy",
                  };
                  const route = routeMap[role];
                  if (route) setLocation(route);
                }}
                data-testid="button-go-dashboard"
                className="gap-2"
              >
                Go to {role} Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="outline"
              onClick={() => setLocation("/verify")}
              data-testid="button-verify-drug"
              className="gap-2"
            >
              <QrCode className="w-4 h-4" />
              Verify a Drug
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 border-t border-border/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl font-semibold text-center mb-10 text-foreground">
            Built for Regulated Supply Chains
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors"
                >
                  <div className={cn("w-9 h-9 rounded flex items-center justify-center mb-3", f.bg)}>
                    <Icon className={cn("w-5 h-5", f.color)} />
                  </div>
                  <h3 className="font-semibold text-sm text-foreground mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="py-16 px-4 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-center mb-10 text-foreground">
            The Supply Chain Pipeline
          </h2>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 rounded border border-border bg-card hover:border-border/80 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-muted-foreground flex-shrink-0">
                  {i + 1}
                </div>
                <span className="text-sm text-foreground flex-1">{step.label}</span>
                <Badge
                  variant="outline"
                  className={cn("text-xs border shrink-0", roleColors[step.role])}
                >
                  {step.role}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 text-center text-xs text-muted-foreground">
        <p>PharmaChain &mdash; Decentralized Pharmaceutical Supply Chain &mdash; Sepolia Testnet</p>
      </footer>
    </div>
  );
}
