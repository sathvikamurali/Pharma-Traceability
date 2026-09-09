import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ethers } from "ethers";
import { useVerifyBatch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import contractData from "@/contracts/PharmaChain.json";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Factory,
  Truck,
  ShoppingCart,
  Clock,
  ArrowDown,
  QrCode,
  Search,
  ExternalLink,
  Package,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Contract constants ────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = (contractData as any).address;
const CONTRACT_ABI     = (contractData as any).abi;

// ── Fallback RPC list — first one that responds wins ─────────────────────────
const SEPOLIA_RPCS = [
  "https://rpc.sepolia.org",
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://eth-sepolia.public.blastapi.io",
  "https://sepolia.drpc.org",
];

async function getProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of SEPOLIA_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await Promise.race([p.getBlockNumber(), new Promise((_, rej) => setTimeout(rej, 4000))]);
      return p;
    } catch { /* try next */ }
  }
  return new ethers.JsonRpcProvider(SEPOLIA_RPCS[0]);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TransferInfo { from: string; to: string; quantity: string; accepted: boolean; }

interface OnChainBatch {
  manufacturer: string;
  currentHolder: string;
  totalQuantity: string;
  status: number;           // 0=Active 1=InTransit 2=Accepted 3=Sold
  transfers: TransferInfo[];
}

interface TxStamp { txHash: string; timestamp: number; }
interface EventStamps {
  registered?: TxStamp;
  transfers:   TxStamp[];
  accepted:    Record<string, TxStamp>; // lc-address → stamp
  sold?:       TxStamp;
}

type ParticipantMap = Record<string, {
  companyName: string; licenseNumber?: string; city?: string; role: string;
}>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(ts: number) {
  return ts > 0
    ? new Date(ts * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
}

function shortAddr(addr?: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function resolveAddr(addr: string | undefined, map: ParticipantMap): string {
  if (!addr) return "—";
  const p = map[addr.toLowerCase()];
  if (!p) return shortAddr(addr);
  return [p.companyName, p.city, p.licenseNumber ? `Lic: ${p.licenseNumber}` : ""]
    .filter(Boolean).join(" · ");
}

// ── Fetch pipeline from contract view functions (ALWAYS works) ────────────────
async function fetchOnChainBatch(batchId: string): Promise<OnChainBatch | null> {
  try {
    const provider = await getProvider();
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const [batch, transfers] = await Promise.all([
      c.getBatch(batchId),
      c.getBatchTransfers(batchId),
    ]);
    return {
      manufacturer:  batch.manufacturer as string,
      currentHolder: batch.currentHolder as string,
      totalQuantity: batch.totalQuantity.toString(),
      status:        Number(batch.status),
      transfers: (transfers as any[]).map(t => ({
        from:     t.from     as string,
        to:       t.to       as string,
        quantity: t.quantity.toString(),
        accepted: Boolean(t.accepted),
      })),
    };
  } catch (e) {
    console.error("getBatch failed", e);
    return null;
  }
}

// ── Try to get event timestamps (best-effort, silent on failure) ──────────────
async function fetchEventStamps(batchId: string): Promise<EventStamps> {
  const out: EventStamps = { transfers: [], accepted: {} };
  try {
    const provider = await getProvider();
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const latest    = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 150_000); // last ~20 days on Sepolia

    const getTs = async (bn: number) => {
      try { return Number((await provider.getBlock(bn))?.timestamp ?? 0); } catch { return 0; }
    };

    const [r, t, a] = await Promise.all([
      c.queryFilter(c.filters.BatchRegistered(), fromBlock).catch(() => []),
      c.queryFilter(c.filters.BatchTransferred(), fromBlock).catch(() => []),
      c.queryFilter(c.filters.BatchAccepted(),   fromBlock).catch(() => []),
    ]);

    for (const log of r as ethers.EventLog[]) {
      if (log.args?.[0] === batchId)
        out.registered = { txHash: log.transactionHash, timestamp: await getTs(log.blockNumber) };
    }
    for (const log of t as ethers.EventLog[]) {
      if (log.args?.[0] === batchId)
        out.transfers.push({ txHash: log.transactionHash, timestamp: await getTs(log.blockNumber) });
    }
    for (const log of a as ethers.EventLog[]) {
      if (log.args?.[0] === batchId)
        out.accepted[(log.args[1] as string).toLowerCase()] =
          { txHash: log.transactionHash, timestamp: await getTs(log.blockNumber) };
    }
    try {
      const s = await c.queryFilter(c.filters.BatchSold(), fromBlock).catch(() => []);
      for (const log of s as ethers.EventLog[]) {
        if (log.args?.[0] === batchId)
          out.sold = { txHash: log.transactionHash, timestamp: await getTs(log.blockNumber) };
      }
    } catch { /* optional */ }
  } catch { /* silent */ }
  return out;
}

// ── Participant profiles ──────────────────────────────────────────────────────
async function fetchParticipants(): Promise<ParticipantMap> {
  try {
    const res = await fetch("/api/pharmachain/participants");
    if (!res.ok) return {};
    const rows: Array<{ address: string } & ParticipantMap[string]> = await res.json();
    return Object.fromEntries(rows.map(r => [r.address.toLowerCase(), r]));
  } catch { return {}; }
}

// ── Pipeline card component ───────────────────────────────────────────────────
function PipelineCard({
  stepNum, totalSteps, title, icon: Icon, accentBg, borderCls,
  address, quantity, participants,
  registeredAt, acceptedAt, dispatchedAt, txHash, txLabel,
}: {
  stepNum: number; totalSteps: number; title: string;
  icon: React.ElementType; accentBg: string; borderCls: string;
  address?: string; quantity?: string; participants: ParticipantMap;
  registeredAt?: number; acceptedAt?: number; dispatchedAt?: number;
  txHash?: string; txLabel: string;
}) {
  const profile = address ? participants[address.toLowerCase()] : null;
  return (
    <div>
      <div className={cn("rounded-2xl border-2 p-5 transition-all hover:shadow-lg", borderCls)}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("w-11 h-11 rounded-full flex items-center justify-center shrink-0", accentBg)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                Step {stepNum} of {totalSteps}
              </span>
            </div>
            <p className="text-base font-bold text-foreground">{title}</p>
            {profile ? (
              <p className="text-sm font-semibold text-primary">{profile.companyName}</p>
            ) : address ? (
              <p className="text-xs font-mono text-muted-foreground">{shortAddr(address)}</p>
            ) : null}
          </div>
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
        </div>

        {/* Identity grid */}
        {(profile || address || quantity) && (
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            {profile?.city && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Location</p>
                <p className="text-foreground font-medium">{profile.city}</p>
              </div>
            )}
            {profile?.licenseNumber && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">License</p>
                <p className="font-mono text-foreground">{profile.licenseNumber}</p>
              </div>
            )}
            {profile?.role && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Verified Role</p>
                <p className="text-foreground">{profile.role}</p>
              </div>
            )}
            {quantity && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Units</p>
                <p className="font-bold text-foreground">{parseInt(quantity).toLocaleString()} units</p>
              </div>
            )}
            {address && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-0.5">Wallet Address</p>
                <p className="text-[11px] font-mono text-muted-foreground break-all">{address}</p>
              </div>
            )}
          </div>
        )}

        {/* Timestamps */}
        {(registeredAt || acceptedAt || dispatchedAt) && (
          <div className="border-t border-border/60 pt-3 space-y-1.5">
            {registeredAt && fmt(registeredAt) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <span className="text-muted-foreground/60 w-20 shrink-0">Registered</span>
                <span className="text-foreground">{fmt(registeredAt)}</span>
              </div>
            )}
            {acceptedAt && fmt(acceptedAt) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-muted-foreground/60 w-20 shrink-0">Accepted</span>
                <span className="text-foreground">{fmt(acceptedAt)}</span>
              </div>
            )}
            {dispatchedAt && fmt(dispatchedAt) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                <span className="text-muted-foreground/60 w-20 shrink-0">Dispatched</span>
                <span className="text-foreground">{fmt(dispatchedAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* TX link */}
        {txHash && (
          <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 text-[11px] text-primary/60 hover:text-primary transition-colors font-mono"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            {txLabel}: {txHash.slice(0, 22)}...
          </a>
        )}
      </div>

      {/* ↓ connector */}
      {stepNum < totalSteps && (
        <div className="flex flex-col items-center py-1">
          <div className="w-px h-5 bg-border" />
          <ArrowDown className="w-4 h-4 text-muted-foreground/30" />
          <div className="w-px h-5 bg-border" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function VerifyBatch() {
  const params = useParams<{ batchId?: string }>();
  const [, setLocation] = useLocation();
  const [inputBatchId, setInputBatchId]   = useState(params?.batchId || "");
  const [activeBatchId, setActiveBatchId] = useState(params?.batchId || "");

  const [participants,   setParticipants]   = useState<ParticipantMap>({});
  const [onChainBatch,   setOnChainBatch]   = useState<OnChainBatch | null>(null);
  const [eventStamps,    setEventStamps]    = useState<EventStamps>({ transfers: [], accepted: {} });
  const [isLoadingChain, setIsLoadingChain] = useState(false);
  const [chainError,     setChainError]     = useState<string | null>(null);

  // Off-chain metadata from our API (drug name, expiry, composition…)
  const { data: verification, isLoading, error } = useVerifyBatch(activeBatchId, {
    query: {
      enabled: !!activeBatchId,
      queryKey: [`/pharmachain/verify/${activeBatchId}`] as const,
      retry: 1,
    },
  });

  // Load participant profiles once
  useEffect(() => { fetchParticipants().then(setParticipants); }, []);

  // Route param sync
  useEffect(() => {
    if (params?.batchId) {
      setInputBatchId(params.batchId);
      setActiveBatchId(params.batchId);
    }
  }, [params?.batchId]);

  // Load on-chain data whenever activeBatchId changes
  useEffect(() => {
    if (!activeBatchId) return;
    setOnChainBatch(null);
    setChainError(null);
    setIsLoadingChain(true);

    fetchOnChainBatch(activeBatchId).then(b => {
      setOnChainBatch(b);
      if (!b) setChainError("Could not read batch from blockchain. Check the batch ID.");
    }).finally(() => setIsLoadingChain(false));

    // Timestamps are best-effort
    fetchEventStamps(activeBatchId).then(setEventStamps);
  }, [activeBatchId]);

  const handleSearch = () => {
    const id = inputBatchId.trim();
    if (id) { setActiveBatchId(id); setLocation(`/verify/${id}`); }
  };

  // Build authenticity status
  const isAuthentic = verification?.isAuthentic ?? (!!onChainBatch);
  const isSold      = verification?.currentStatus === "Sold" || onChainBatch?.status === 3;
  const isRecalled  = verification?.currentStatus === "Recalled";

  // Journey steps completed
  const hasManufacturer = !!onChainBatch?.manufacturer;
  const hasDistributor  = onChainBatch?.transfers && onChainBatch.transfers.length > 0;
  const hasPharmacy     = onChainBatch?.transfers && onChainBatch.transfers.some(t => t.accepted);
  const hasSold         = isSold;

  // Build pipeline steps from contract data
  const buildPipeline = () => {
    if (!onChainBatch) return null;
    const { manufacturer, transfers, status } = onChainBatch;

    // First accepted transfer → distributor accepted
    const distTransfer   = transfers[0];           // manufacturer → distributor
    const pharmaTransfer = transfers[1];           // distributor  → pharmacy

    // Accepted addresses from event stamps
    const distAc  = distTransfer  ? eventStamps.accepted[distTransfer.to.toLowerCase()]  : undefined;
    const pharmaAc= pharmaTransfer? eventStamps.accepted[pharmaTransfer.to.toLowerCase()]: undefined;
    // fallback: use currentHolder if accepted
    const pharmaAddr = pharmaTransfer?.to
      ?? (distTransfer?.accepted ? onChainBatch.currentHolder : undefined);

    const steps: JSX.Element[] = [];
    let stepCount = 1 + (distTransfer ? 1 : 0) + (pharmaAddr ? 1 : 0) + (status === 3 ? 1 : 0);
    let i = 0;

    // Step 1: Manufacturer
    steps.push(
      <PipelineCard key="mfg"
        stepNum={++i} totalSteps={stepCount} title="Manufactured"
        icon={Factory} accentBg="bg-blue-500/20 text-blue-400" borderCls="border-blue-500/30"
        address={manufacturer} participants={participants}
        quantity={onChainBatch.totalQuantity}
        registeredAt={eventStamps.registered?.timestamp}
        dispatchedAt={eventStamps.transfers[0]?.timestamp}
        txHash={eventStamps.registered?.txHash} txLabel="Registration TX"
      />
    );

    // Step 2: Distributor
    if (distTransfer) {
      steps.push(
        <PipelineCard key="dist"
          stepNum={++i} totalSteps={stepCount} title="Distributed"
          icon={Truck} accentBg="bg-yellow-500/20 text-yellow-400" borderCls="border-yellow-500/30"
          address={distTransfer.to} participants={participants}
          quantity={distTransfer.quantity}
          registeredAt={eventStamps.transfers[0]?.timestamp}
          acceptedAt={distAc?.timestamp}
          dispatchedAt={eventStamps.transfers[1]?.timestamp}
          txHash={eventStamps.transfers[0]?.txHash} txLabel="Transfer TX"
        />
      );
    }

    // Step 3: Pharmacy
    if (pharmaAddr) {
      steps.push(
        <PipelineCard key="pharma"
          stepNum={++i} totalSteps={stepCount} title="At Pharmacy"
          icon={Package} accentBg="bg-purple-500/20 text-purple-400" borderCls="border-purple-500/30"
          address={pharmaAddr} participants={participants}
          registeredAt={eventStamps.transfers[1]?.timestamp}
          acceptedAt={pharmaAc?.timestamp}
          dispatchedAt={eventStamps.sold?.timestamp}
          txHash={pharmaAc?.txHash ?? eventStamps.transfers[1]?.txHash} txLabel="Accepted TX"
        />
      );
    }

    // Step 4: Dispensed
    if (status === 3) {
      steps.push(
        <PipelineCard key="sold"
          stepNum={++i} totalSteps={stepCount} title="Dispensed to Patient"
          icon={ShoppingCart} accentBg="bg-green-500/20 text-green-400" borderCls="border-green-500/30"
          participants={participants}
          registeredAt={eventStamps.sold?.timestamp}
          txHash={eventStamps.sold?.txHash} txLabel="Dispensed TX"
        />
      );
    }

    return steps;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-wider text-sm">PHARMACHAIN</span>
          </div>
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Back to Home
          </a>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
            <QrCode className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Verify Your Medicine</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Enter the batch ID printed on your medicine box to see the complete,
            tamper-proof supply chain journey live from the blockchain.
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-8">
          <Input
            placeholder="BATCH-XXXXXXXX-XXXX"
            value={inputBatchId}
            onChange={e => setInputBatchId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="font-mono text-sm"
            data-testid="input-batch-id"
          />
          <Button onClick={handleSearch} className="gap-2 shrink-0" data-testid="button-verify">
            <Search className="w-4 h-4" /> Verify
          </Button>
        </div>

        {/* Loading */}
        {(isLoading || isLoadingChain) && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Reading from blockchain…</span>
          </div>
        )}

        {/* Not found */}
        {!isLoading && !isLoadingChain && error && !verification && !onChainBatch && (
          <div className="flex items-start gap-3 p-5 border border-destructive/30 rounded-lg bg-destructive/10">
            <XCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm text-destructive-foreground">Batch Not Found</p>
              <p className="text-xs text-muted-foreground mt-1">
                No records found for "{activeBatchId}". Check the batch ID and try again.
              </p>
            </div>
          </div>
        )}

        {/* Chain error (no data at all) */}
        {chainError && !onChainBatch && !isLoadingChain && (
          <div className="flex items-start gap-3 p-5 border border-destructive/30 rounded-lg bg-destructive/10">
            <XCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm text-destructive-foreground">Could not read blockchain</p>
              <p className="text-xs text-muted-foreground mt-1">{chainError}</p>
            </div>
          </div>
        )}

        {/* Main content — show once we have either API data or on-chain data */}
        {!isLoadingChain && (verification || onChainBatch) && (
          <div className="space-y-6">

            {/* ── HERO ────────────────────────────────────────────────────── */}
            <div className={cn(
              "rounded-2xl p-8 text-center border-2",
              isSold        ? "border-yellow-500/40 bg-yellow-500/5"
              : isRecalled  ? "border-red-500/40    bg-red-500/5"
              : isAuthentic ? "border-green-500/40  bg-green-500/5"
                            : "border-red-500/40    bg-red-500/5"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-20 h-20 rounded-full mb-4",
                isSold ? "bg-yellow-500/15" : isAuthentic ? "bg-green-500/15" : "bg-red-500/15"
              )}>
                {isSold ? <AlertTriangle className="w-10 h-10 text-yellow-400" />
                : isAuthentic ? <CheckCircle2 className="w-10 h-10 text-green-400" />
                : <XCircle className="w-10 h-10 text-red-400" />}
              </div>

              <h2 className={cn("text-2xl font-bold mb-2",
                isSold ? "text-yellow-400" : isAuthentic ? "text-green-400" : "text-red-400"
              )}>
                {isSold ? "Already Dispensed"
                : isAuthentic ? "Your Medicine is Safe 🟢"
                : "⚠️ Not Verified — Do Not Consume"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {isSold
                  ? "This batch was already dispensed. If the packaging seems reused, do not consume."
                  : isAuthentic
                  ? "Verified on the Ethereum blockchain — every step from manufacturer to pharmacy is authentic."
                  : "This batch could not be verified. Contact your pharmacy immediately."}
              </p>

              {/* Journey progress bar */}
              <div className="mt-6 flex items-center justify-center gap-0 flex-wrap">
                {([
                  { label: "Manufactured", done: hasManufacturer, icon: Factory      },
                  { label: "Distributed",  done: hasDistributor,  icon: Truck        },
                  { label: "At Pharmacy",  done: hasPharmacy,     icon: Package      },
                  { label: "Dispensed",    done: hasSold,         icon: ShoppingCart },
                ] as const).map((s, idx, arr) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center">
                      <div className="flex flex-col items-center gap-1 px-2">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                          s.done
                            ? "bg-green-500/20 border-green-500 text-green-400"
                            : "bg-secondary border-border text-muted-foreground/30"
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={cn("text-xs font-medium whitespace-nowrap",
                          s.done ? "text-green-400" : "text-muted-foreground/30"
                        )}>{s.label}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className={cn("w-8 h-0.5 mb-4 flex-shrink-0",
                          s.done && arr[idx + 1].done ? "bg-green-500" : "bg-border"
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── DRUG DETAILS ──────────────────────────────────────────────── */}
            {verification && (
              <div className="border border-border rounded-xl bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold">Drug Information</h2>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Drug Name</p>
                    <p className="font-semibold text-foreground" data-testid="text-drug-name">{verification.metadata?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Batch ID</p>
                    <p className="font-mono text-xs text-foreground break-all" data-testid="text-batch-id">{verification.batchId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Expiry Date</p>
                    <p className="text-foreground" data-testid="text-expiry">{verification.metadata?.expiryDate || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Storage</p>
                    <p className="text-foreground">{verification.metadata?.storageCondition || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Total Batch Qty</p>
                    <p className="text-foreground">{verification.metadata?.quantity} units</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Current Holder</p>
                    <p className="text-sm font-medium text-foreground">
                      {onChainBatch
                        ? participants[onChainBatch.currentHolder.toLowerCase()]?.companyName ?? shortAddr(onChainBatch.currentHolder)
                        : shortAddr(verification.currentHolder)}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/50">{onChainBatch?.currentHolder ?? verification.currentHolder}</p>
                  </div>
                  {verification.metadata?.composition && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Composition</p>
                      <p className="text-foreground text-sm">{verification.metadata.composition}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PIPELINE ──────────────────────────────────────────────────── */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold">Complete Supply Chain Pipeline</h2>
                </div>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  Live from Ethereum
                </Badge>
              </div>

              <div className="p-5">
                {isLoadingChain && (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl bg-secondary" />)}
                  </div>
                )}

                {!isLoadingChain && !onChainBatch && (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">Pipeline unavailable</p>
                    <p className="text-xs mt-1 opacity-60">Could not load batch data from the blockchain.</p>
                  </div>
                )}

                {!isLoadingChain && onChainBatch && (
                  <div>
                    {buildPipeline()}

                    {/* Footer */}
                    <div className="mt-5 p-4 border border-green-500/20 rounded-xl bg-green-500/5 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-400">
                          Verified on Ethereum Sepolia
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Data read directly from the smart contract. It is immutable and cannot be altered by any party — not even by PharmaChain.
                        </p>
                        <a
                          href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary/60 hover:text-primary inline-flex items-center gap-1 mt-2"
                        >
                          <ExternalLink className="w-3 h-3" /> View Contract on Etherscan
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      <footer className="border-t border-border mt-16 py-8 px-4 text-center text-xs text-muted-foreground">
        <p>PharmaChain Verification &mdash; Powered by Ethereum Sepolia &amp; IPFS</p>
        <p className="mt-1 font-mono text-muted-foreground/50">{CONTRACT_ADDRESS}</p>
      </footer>
    </div>
  );
}
