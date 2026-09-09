import { Router, type IRouter } from "express";
import axios from "axios";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { batchMetadataCache, systemStatsCache } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UploadBatchMetadataBody,
  GetBatchMetadataParams,
  VerifyBatchParams,
  GenerateQrCodeBody,
  GetBatchEventsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PINATA_JWT = process.env.PINATA_JWT || "";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

// ─── Upload Batch Metadata to IPFS ────────────────────────────────────────────
router.post("/pharmachain/metadata", async (req, res) => {
  const parsed = UploadBatchMetadataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const metadata = {
    ...parsed.data,
    uploadedAt: new Date().toISOString(),
    version: "1.0",
  };

  try {
    if (!PINATA_JWT) {
      // Demo mode: return a mock CID
      const mockCid = `Qm${Buffer.from(JSON.stringify(metadata)).toString("base64").substring(0, 44)}`;
      const cached = {
        batchId: parsed.data.batchId,
        cid: mockCid,
        ...parsed.data,
        uploadedAt: metadata.uploadedAt,
      };
      await db.insert(batchMetadataCache).values(cached).onConflictDoUpdate({
        target: batchMetadataCache.batchId,
        set: cached,
      });
      res.status(201).json({
        cid: mockCid,
        ipfsUrl: `ipfs://${mockCid}`,
        pinataUrl: `${PINATA_GATEWAY}/${mockCid}`,
      });
      return;
    }

    const pinataResponse = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `PharmaChain-Batch-${parsed.data.batchId}`,
          keyvalues: {
            batchId: parsed.data.batchId,
            type: "batch-metadata",
          },
        },
        pinataOptions: { cidVersion: 1 },
      },
      {
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          "Content-Type": "application/json",
        },
      }
    );

    const cid: string = pinataResponse.data.IpfsHash;
    const cached = {
      batchId: parsed.data.batchId,
      cid,
      ...parsed.data,
      uploadedAt: metadata.uploadedAt,
    };
    await db.insert(batchMetadataCache).values(cached).onConflictDoUpdate({
      target: batchMetadataCache.batchId,
      set: cached,
    });

    res.status(201).json({
      cid,
      ipfsUrl: `ipfs://${cid}`,
      pinataUrl: `${PINATA_GATEWAY}/${cid}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to upload to Pinata");
    res.status(500).json({ error: "Failed to upload metadata to IPFS" });
  }
});

// ─── Get Batch Metadata from IPFS ─────────────────────────────────────────────
router.get("/pharmachain/metadata/:cid", async (req, res) => {
  const parsed = GetBatchMetadataParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid CID" });
    return;
  }

  const { cid } = parsed.data;

  // Try DB cache first (by cid)
  const cached = await db
    .select()
    .from(batchMetadataCache)
    .where(eq(batchMetadataCache.cid, cid))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    res.json({
      name: row.name,
      expiryDate: row.expiryDate,
      quantity: row.quantity,
      composition: row.composition,
      storageCondition: row.storageCondition,
      manufacturerAddress: row.manufacturerAddress,
      batchId: row.batchId,
      uploadedAt: row.uploadedAt ?? undefined,
      cid,
    });
    return;
  }

  // Fetch from IPFS gateway
  try {
    const response = await axios.get(`${PINATA_GATEWAY}/${cid}`, { timeout: 10000 });
    const data = response.data;
    res.json({ ...data, cid });
  } catch (err) {
    req.log.error({ err, cid }, "Failed to fetch from IPFS");
    res.status(404).json({ error: "Metadata not found on IPFS" });
  }
});

// ─── Consumer Verification ─────────────────────────────────────────────────────
router.get("/pharmachain/verify/:batchId", async (req, res) => {
  const parsed = VerifyBatchParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid batch ID" });
    return;
  }

  const { batchId } = parsed.data;

  // Check DB cache for metadata
  const cachedMeta = await db
    .select()
    .from(batchMetadataCache)
    .where(eq(batchMetadataCache.batchId, batchId))
    .limit(1);

  if (cachedMeta.length === 0) {
    res.status(404).json({ error: "Batch not found. It may not have been indexed yet." });
    return;
  }

  const meta = cachedMeta[0];

  // Return verification result — events come from blockchain (frontend reads via ethers.js)
  // This endpoint provides the metadata portion; events are fetched client-side from chain
  res.json({
    batchId,
    metadata: {
      name: meta.name,
      expiryDate: meta.expiryDate,
      quantity: meta.quantity,
      composition: meta.composition,
      storageCondition: meta.storageCondition,
      manufacturerAddress: meta.manufacturerAddress,
      batchId: meta.batchId,
      uploadedAt: meta.uploadedAt ?? undefined,
      cid: meta.cid,
    },
    events: [],
    currentStatus: "Active",
    currentHolder: meta.manufacturerAddress,
    currentHolderRole: "Manufacturer",
    isAuthentic: true,
  });
});

// ─── QR Code Generation ────────────────────────────────────────────────────────
router.post("/pharmachain/qr", async (req, res) => {
  const parsed = GenerateQrCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { type, walletAddress, role, batchId, label } = parsed.data;
  let data: string;

  if (type === "identity") {
    data = JSON.stringify({
      type: "pharmachain-identity",
      walletAddress: walletAddress ?? "",
      role: role ?? "",
      verifiedAt: new Date().toISOString(),
    });
  } else {
    const baseUrl = process.env.APP_URL || "https://pharmachain.app";
    data = `${baseUrl}/verify/${batchId ?? ""}`;
  }

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      errorCorrectionLevel: "H",
      type: "image/png",
      width: 512,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    res.json({
      qrCodeDataUrl,
      data,
      label: label ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate QR code");
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// ─── System Stats ──────────────────────────────────────────────────────────────
router.get("/pharmachain/stats", async (req, res) => {
  // Return cached stats or zeros if not yet populated
  const stats = await db.select().from(systemStatsCache).where(eq(systemStatsCache.id, 1)).limit(1);

  if (stats.length > 0) {
    const s = stats[0];
    res.json({
      totalManufacturers: s.totalManufacturers,
      totalDistributors: s.totalDistributors,
      totalPharmacies: s.totalPharmacies,
      totalBatches: s.totalBatches,
      totalTransfers: s.totalTransfers,
      totalSold: s.totalSold,
    });
  } else {
    res.json({
      totalManufacturers: 0,
      totalDistributors: 0,
      totalPharmacies: 0,
      totalBatches: 0,
      totalTransfers: 0,
      totalSold: 0,
    });
  }
});

// ─── Update Stats (called after on-chain events) ───────────────────────────────
router.post("/pharmachain/stats/sync", async (req, res) => {
  const {
    totalManufacturers = 0,
    totalDistributors = 0,
    totalPharmacies = 0,
    totalBatches = 0,
    totalTransfers = 0,
    totalSold = 0,
  } = req.body;

  const values = {
    id: 1,
    totalManufacturers,
    totalDistributors,
    totalPharmacies,
    totalBatches,
    totalTransfers,
    totalSold,
    updatedAt: new Date(),
  };

  await db.insert(systemStatsCache).values(values).onConflictDoUpdate({
    target: systemStatsCache.id,
    set: { totalManufacturers, totalDistributors, totalPharmacies, totalBatches, totalTransfers, totalSold, updatedAt: new Date() },
  });

  res.json({ success: true });
});

// ─── Batch Events (served from frontend-side chain data, synced here) ─────────
router.get("/pharmachain/events/:batchId", async (req, res) => {
  const parsed = GetBatchEventsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid batch ID" });
    return;
  }

  // Events are read from the blockchain by the frontend — this is a passthrough/stub
  // Frontend uses ethers.js to query contract events directly
  res.json([]);
});

// ─── Participant Profiles ──────────────────────────────────────────────────────
// Save or update a participant's human-readable profile (name, license, city)
router.post("/pharmachain/participants", async (req, res) => {
  const { participantProfiles } = await import("@workspace/db");
  const body = req.body as {
    address: string; companyName: string; licenseNumber?: string;
    role: string; city?: string;
  };
  if (!body.address || !body.companyName || !body.role) {
    res.status(400).json({ error: "address, companyName, role are required" });
    return;
  }
  try {
    const record = {
      address: body.address.toLowerCase(),
      companyName: body.companyName.trim(),
      licenseNumber: body.licenseNumber?.trim() || null,
      role: body.role,
      city: body.city?.trim() || null,
    };
    await db.insert(participantProfiles).values(record)
      .onConflictDoUpdate({ target: participantProfiles.address, set: record });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup a single participant by wallet address
router.get("/pharmachain/participants/:address", async (req, res) => {
  const { participantProfiles } = await import("@workspace/db");
  const address = (req.params.address as string).toLowerCase();
  try {
    const rows = await db.select().from(participantProfiles)
      .where(eq(participantProfiles.address, address));
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Return all participant profiles (used by verify page to resolve all addresses at once)
router.get("/pharmachain/participants", async (_req, res) => {
  const { participantProfiles } = await import("@workspace/db");
  try {
    const rows = await db.select().from(participantProfiles);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
