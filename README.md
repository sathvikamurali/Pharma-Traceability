# PharmaChain

A blockchain-based pharmaceutical supply chain traceability platform for batch tracking, supply chain event management, and counterfeit drug verification using Ethereum smart contracts and a React-based web application.

## Overview

PharmaChain is designed to improve transparency and traceability across the pharmaceutical supply chain.

The platform records pharmaceutical batch information and supply chain events on the blockchain, allowing authorized participants to track a product's movement through different stages of the supply chain and verify whether a batch is authentic.

The system combines:

* **Ethereum blockchain** for tamper-resistant supply chain records
* **Solidity smart contracts** for batch registration, tracking, and verification
* **React + TypeScript** for the web interface
* **Express.js** for backend API services
* **QR codes** for convenient batch verification
* **Web3 / ethers.js** for blockchain interaction

---

## Key Features

### Blockchain-Based Traceability

Pharmaceutical batch records and supply chain events are managed through an Ethereum smart contract, providing a tamper-resistant record of product movement.

### Batch Management

Manufacturers can register pharmaceutical batches with relevant metadata and supply chain information.

### Supply Chain Tracking

The system tracks supply chain events as pharmaceutical products move between participants such as manufacturers, distributors, and pharmacies.

### Batch Verification

Users can verify a pharmaceutical batch and retrieve its current status and associated supply chain information.

### QR Code Verification

Batch information can be represented through QR codes, allowing verification workflows to be initiated conveniently.

### Role-Based Workflows

The application provides separate interfaces for different supply chain participants:

* Manufacturer
* Distributor
* Pharmacy
* Administrator

### Web3 Integration

The React frontend communicates with the Ethereum blockchain through Web3 functionality and `ethers.js`.

---

## System Architecture

```text
                     ┌───────────────────────┐
                     │       React UI        │
                     │    TypeScript + Vite  │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │    Web3 / ethers.js   │
                     └───────────┬───────────┘
                                 │
                         Ethereum Network
                                 │
                     ┌───────────▼───────────┐
                     │  PharmaChain Smart    │
                     │       Contract        │
                     │       Solidity        │
                     └───────────┬───────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
         ┌────────▼─────────┐         ┌────────▼─────────┐
         │  Supply Chain    │         │ Batch Verification│
         │  Event Tracking  │         │  & Status Checks  │
         └──────────────────┘         └──────────────────┘

                     ┌───────────────────────┐
                     │    Express Backend    │
                     │      REST APIs        │
                     └───────────────────────┘
```

---

## Technology Stack

| Layer                      | Technology          |
| -------------------------- | ------------------- |
| Frontend                   | React, TypeScript   |
| Build Tool                 | Vite                |
| Styling                    | Tailwind CSS        |
| UI Components              | shadcn/ui           |
| Backend                    | Node.js, Express.js |
| Blockchain                 | Ethereum            |
| Smart Contracts            | Solidity            |
| Blockchain Interaction     | ethers.js / Web3    |
| Smart Contract Development | Hardhat             |
| API Specification          | OpenAPI             |
| Validation                 | Zod                 |
| Database Layer             | Drizzle ORM         |
| Package Management         | pnpm                |

---

## Project Structure

```text
Pharma-Traceability/
│
├── artifacts/
│   ├── api-server/
│   │   └── src/
│   │       ├── routes/
│   │       ├── middlewares/
│   │       └── lib/
│   │
│   └── pharmachain/
│       ├── public/
│       └── src/
│           ├── components/
│           ├── contexts/
│           ├── contracts/
│           ├── hooks/
│           ├── pages/
│           │   ├── admin/
│           │   ├── distributor/
│           │   ├── manufacturer/
│           │   ├── pharmacy/
│           │   └── verify/
│           └── types/
│
├── contracts/
│   ├── src/
│   │   └── PharmaChain.sol
│   ├── scripts/
│   │   └── deploy.js
│   ├── PharmaChain.sol
│   ├── PharmaChainDeployment.json
│   └── hardhat.config.js
│
├── lib/
│   ├── api-client-react/
│   ├── api-spec/
│   │   └── openapi.yaml
│   ├── api-zod/
│   └── db/
│       └── src/
│           └── schema/
│
├── scripts/
├── attached_assets/
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

---

## Supply Chain Workflow

The core workflow follows the lifecycle of a pharmaceutical batch:

```text
Manufacturer
     │
     │ Register Batch
     ▼
Blockchain
     │
     │ Supply Chain Event
     ▼
Distributor
     │
     │ Transfer / Update
     ▼
Blockchain
     │
     │ Supply Chain Event
     ▼
Pharmacy
     │
     │ Verify Batch
     ▼
Consumer / Verifier
```

Each relevant event contributes to the traceability history of the pharmaceutical batch.

---

## Smart Contract

The core blockchain functionality is implemented in:

```text
contracts/src/PharmaChain.sol
```

The contract is responsible for managing pharmaceutical batch and supply chain information on the Ethereum network.

The repository also contains the deployment configuration and deployment artifacts:

```text
contracts/
├── PharmaChain.sol
├── PharmaChainDeployment.json
├── hardhat.config.js
└── scripts/
    └── deploy.js
```

---

## Frontend

The frontend application is located in:

```text
artifacts/pharmachain/
```

Major application areas include:

```text
src/pages/
├── admin/
├── distributor/
├── manufacturer/
├── pharmacy/
├── verify/
└── Landing.tsx
```

The frontend uses React and TypeScript and provides role-specific dashboards for interacting with the pharmaceutical traceability system.

---

## Backend

The backend API is located in:

```text
artifacts/api-server/
```

It is implemented using Node.js and Express.js.

API routes include functionality related to:

* Health checks
* PharmaChain operations
* Batch metadata
* QR code generation
* Verification-related operations

The API specification and generated clients are maintained under:

```text
lib/
├── api-client-react/
├── api-spec/
└── api-zod/
```

---

## Getting Started

### Prerequisites

Make sure the following are installed:

* Node.js
* npm
* pnpm
* MetaMask browser extension
* An Ethereum-compatible network/provider for blockchain interaction

### 1. Clone the Repository

```bash
git clone https://github.com/sathvikamurali/Pharma-Traceability.git
cd Pharma-Traceability
```

### 2. Install Dependencies

The project uses pnpm workspaces.

```bash
pnpm install
```

### 3. Configure Blockchain Environment Variables

Create an environment file inside the contracts directory:

```text
contracts/.env
```

Use the provided example as a reference:

```text
contracts/.env.example
```

Add your own blockchain provider credentials and deployment configuration.

**Never commit private keys, API keys, RPC credentials, or other secrets to GitHub.**

### 4. Compile the Smart Contract

From the contracts directory:

```bash
cd contracts
npx hardhat compile
```

### 5. Deploy the Smart Contract

Configure the target Ethereum network in your environment and Hardhat configuration, then run:

```bash
npx hardhat run scripts/deploy.js --network <network>
```

After deployment, update the frontend contract configuration with the deployed contract details if required.

### 6. Start the Application

Return to the project root:

```bash
cd ..
```

Start the required application services using the project's package scripts.

---

## Environment Variables

Blockchain credentials should be stored locally and must not be committed.

Example:

```env
PRIVATE_KEY=your_private_key
ALCHEMY_API_URL=your_rpc_url
ETHERSCAN_API_KEY=your_api_key
```

The repository provides:

```text
contracts/.env.example
```

with placeholder values for configuration.

> **Security:** Never use or commit real wallet private keys or API credentials in `.env.example` or source files.

---

## Verification Flow

A typical verification workflow is:

```text
1. User receives a pharmaceutical batch
                │
                ▼
2. Batch ID / QR code is provided
                │
                ▼
3. Verification request is submitted
                │
                ▼
4. Blockchain record is queried
                │
                ▼
5. Batch status and traceability information
   are displayed
```

This allows the system to provide a transparent history for registered pharmaceutical batches.

---

## Why Blockchain?

Traditional pharmaceutical supply chains can involve multiple independent participants and information systems.

A blockchain-based approach provides:

* **Immutability** — recorded blockchain data is difficult to alter retroactively
* **Transparency** — authorized participants can verify recorded events
* **Traceability** — batch movement can be represented as a sequence of events
* **Decentralization** — records are not dependent on a single centralized ledger
* **Verification** — batch information can be checked against on-chain records

---

## Future Enhancements

Potential improvements include:

* Integration with additional blockchain networks
* Decentralized storage for pharmaceutical metadata
* Stronger identity and access management
* IoT-based temperature and storage monitoring
* Automated alerts for suspicious supply chain activity
* Advanced counterfeit detection mechanisms
* Mobile-based QR verification
* Analytics dashboards for supply chain monitoring
* Integration with pharmaceutical regulatory systems

---
