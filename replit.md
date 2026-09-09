# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## PharmaChain App

### Overview

Decentralized pharmaceutical supply chain tracking app on Ethereum Sepolia testnet.

- **Frontend**: `artifacts/pharmachain` — React + Vite + ethers.js + shadcn/ui
- **Backend**: `artifacts/api-server` — Express API with IPFS/Pinata proxy, QR generation, stats
- **Smart Contract**: `contracts/PharmaChain.sol` — Solidity with OpenZeppelin RBAC
- **DB Schema**: `lib/db/src/schema/pharmachain.ts` — batch_metadata_cache, system_stats_cache
- **API Spec**: `lib/api-spec/openapi.yaml` — full OpenAPI 3.0 spec
- **ABI**: `artifacts/pharmachain/src/contracts/PharmaChain.json`

### Frontend Routes

| Route | Component | Description |
|---|---|---|
| `/` | Landing.tsx | Hero page, wallet connect, feature overview |
| `/admin` | AdminDashboard.tsx | Admin: stats, add manufacturer, view manufacturers, QR |
| `/manufacturer` | ManufacturerDashboard.tsx | Register batches, manage distributors, transfer |
| `/distributor` | DistributorDashboard.tsx | Accept batches, manage pharmacies, transfer |
| `/pharmacy` | PharmacyDashboard.tsx | Accept batches, manage stock, mark as sold |
| `/verify/:batchId` | VerifyBatch.tsx | Public consumer QR verification (no wallet needed) |

### Smart Contract Roles

- `DEFAULT_ADMIN_ROLE` — Admin (deployer)
- `MANUFACTURER_ROLE` — Registered manufacturers
- `DISTRIBUTOR_ROLE` — Registered distributors
- `PHARMACY_ROLE` — Registered pharmacies

### Contract Status Enum

| Value | Meaning |
|---|---|
| 0 | Active (registered, held by manufacturer) |
| 1 | In Transit (transferred, pending acceptance) |
| 2 | Accepted (held by distributor or pharmacy) |
| 3 | Sold (dispensed to consumer) |

### Environment Variables Required

| Variable | Purpose |
|---|---|
| `PINATA_JWT` | Pinata IPFS upload (optional — mock CID used if missing) |
| `ALCHEMY_API_KEY` | Ethereum Sepolia RPC |
| `DEPLOYER_PRIVATE_KEY` | Deploy the smart contract |
| `CONTRACT_ADDRESS` | Must be set after deployment (update PharmaChain.json) |
| `DATABASE_URL` | Auto-provided by Replit PostgreSQL |

### Design

- Theme: Deep navy (`#0f172a` background) + vivid blue primary + teal accent
- Fonts: Inter (sans) + Space Mono (mono)
- Dark-only, Bloomberg terminal aesthetic

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
