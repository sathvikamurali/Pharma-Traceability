const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying PharmaChain with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const PharmaChain = await ethers.getContractFactory("PharmaChain");
  const pharmaChain = await PharmaChain.deploy(deployer.address);
  await pharmaChain.waitForDeployment();

  const address = await pharmaChain.getAddress();
  console.log("PharmaChain deployed to:", address);

  // Save the ABI for the frontend
  const artifact = await artifacts.readArtifact("PharmaChain");
  const abiOutput = {
    address,
    abi: artifact.abi,
    network: "sepolia",
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../PharmaChainDeployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(abiOutput, null, 2));
  console.log("Deployment info saved to:", outputPath);

  // Also write a frontend-ready contract config
  const frontendPath = path.join(
    __dirname,
    "../../artifacts/pharmachain/src/contracts/PharmaChain.json"
  );
  fs.mkdirSync(path.dirname(frontendPath), { recursive: true });
  fs.writeFileSync(frontendPath, JSON.stringify(abiOutput, null, 2));
  console.log("Frontend contract config saved to:", frontendPath);

  console.log("\n✅ Deployment complete!");
  console.log("📋 Next steps:");
  console.log("   1. Set CONTRACT_ADDRESS=" + address + " in your environment");
  console.log("   2. Restart the API server");
  console.log("   3. Open the app and connect your Admin wallet");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
