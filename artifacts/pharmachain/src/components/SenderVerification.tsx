/**
 * SenderVerification — shows on the incoming batch card for distributors & pharmacies.
 * Queries the smart contract directly to verify the sender has the expected role.
 * Provides Etherscan links so anyone can independently confirm authenticity.
 */
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/contexts/Web3Context";
import {
  Shield,
  CheckCircle2,
  XCircle,
  ExternalLink,
  QrCode,
  Loader2,
} from "lucide-react";

interface SenderVerificationProps {
  /** Wallet address of the party who sent the batch */
  senderAddress: string;
  /** What role should this sender have on the contract? */
  expectedRole: "Manufacturer" | "Distributor";
  /** Batch ID — used to build the verify-page link */
  batchId: string;
}

// Compute role hashes exactly as the Solidity contract does:
// bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
const ROLE_HASHES: Record<string, string> = {
  Manufacturer: ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE")),
  Distributor:  ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE")),
};

const ROLE_COLORS: Record<string, string> = {
  Manufacturer: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  Distributor:  "text-purple-400 border-purple-500/30 bg-purple-500/10",
};

export function SenderVerification({
  senderAddress,
  expectedRole,
  batchId,
}: SenderVerificationProps) {
  const { contract } = useWeb3();
  const [status, setStatus] = useState<"idle" | "loading" | "verified" | "failed" | "error">("idle");

  useEffect(() => {
    if (!contract || !senderAddress) return;
    setStatus("loading");

    const roleHash = ROLE_HASHES[expectedRole];
    contract
      .hasRole(roleHash, senderAddress)
      .then((hasIt: boolean) => setStatus(hasIt ? "verified" : "failed"))
      .catch(() => setStatus("error"));
  }, [contract, senderAddress, expectedRole]);

  const short = senderAddress
    ? `${senderAddress.slice(0, 10)}...${senderAddress.slice(-6)}`
    : "—";

  const roleColor = ROLE_COLORS[expectedRole] ?? "";

  return (
    <div className="mt-3 border border-border rounded-lg bg-secondary/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-primary" />
          <span className="text-xs font-medium text-foreground">Sender Verification</span>
        </div>

        {/* Live verification badge */}
        {status === "loading" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking chain...
          </div>
        )}
        {status === "verified" && (
          <div className="flex items-center gap-1 text-xs font-semibold text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verified on-chain
          </div>
        )}
        {status === "failed" && (
          <div className="flex items-center gap-1 text-xs font-semibold text-red-400">
            <XCircle className="w-3.5 h-3.5" />
            NOT registered!
          </div>
        )}
        {status === "error" && (
          <span className="text-xs text-muted-foreground">Verification unavailable</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        {/* Role badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Role expected:</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleColor}`}>
            {expectedRole}
          </span>
          {status === "verified" && (
            <span className="text-xs text-green-400">✅ Confirmed</span>
          )}
          {status === "failed" && (
            <span className="text-xs text-red-400">❌ MISMATCH — DO NOT ACCEPT</span>
          )}
        </div>

        {/* Sender address */}
        <div>
          <p className="text-xs text-muted-foreground/60 mb-0.5">
            {expectedRole} wallet address
          </p>
          <p className="font-mono text-xs text-foreground break-all">{senderAddress}</p>
        </div>

        {/* Verification links */}
        <div className="flex flex-col gap-1 pt-1 border-t border-border">
          <a
            href={`https://sepolia.etherscan.io/address/${senderAddress}#readContract`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary/70 hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Verify {expectedRole} role on Etherscan
          </a>
          <a
            href={`/verify/${batchId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary/70 hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <QrCode className="w-3 h-3" />
            View full supply chain for this batch
          </a>
        </div>
      </div>
    </div>
  );
}
