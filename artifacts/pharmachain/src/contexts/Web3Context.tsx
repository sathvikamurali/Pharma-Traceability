import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { ethers } from "ethers";
import contractData from "@/contracts/PharmaChain.json";
import { toast } from "sonner";

type Role = "Admin" | "Manufacturer" | "Distributor" | "Pharmacy" | "None" | null;

interface Web3ContextState {
  account: string | null;
  isConnecting: boolean;
  role: Role;
  contract: ethers.Contract | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  connectWallet: () => Promise<void>;
  isWrongNetwork: boolean;
  contractDeployed: boolean;
}

const Web3Context = createContext<Web3ContextState | undefined>(undefined);

const SEPOLIA_CHAIN_ID = 11155111;

export function Web3Provider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);
  const [contractDeployed, setContractDeployed] = useState(!!contractData.address);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      setAccount(null);
      setRole(null);
      setSigner(null);
      setContract(null);
    } else {
      connectWallet(); // Reconnect to update states
    }
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask is not installed.");
      return;
    }

    if (!contractData.address) {
      setContractDeployed(false);
      toast.error("Contract not deployed. Please set the contract address.");
      return;
    }

    setIsConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
        setIsWrongNetwork(true);
        toast.error("Please connect to the Sepolia testnet.");
        setIsConnecting(false);
        return;
      }
      setIsWrongNetwork(false);

      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const currentAccount = accounts[0];
      setAccount(currentAccount);

      const newSigner = await browserProvider.getSigner();
      setSigner(newSigner);

      const newContract = new ethers.Contract(contractData.address, contractData.abi, newSigner);
      setContract(newContract);

      try {
        const userRole = await newContract.getUserRole(currentAccount);
        if (userRole && userRole !== "None") {
          setRole(userRole as Role);
        } else {
          // Fallback: check roles individually via hasRole
          const ADMIN_ROLE = ethers.ZeroHash; // DEFAULT_ADMIN_ROLE = bytes32(0)
          const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
          const DISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE"));
          const PHARMACY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PHARMACY_ROLE"));

          if (await newContract.hasRole(ADMIN_ROLE, currentAccount)) {
            setRole("Admin");
          } else if (await newContract.hasRole(MANUFACTURER_ROLE, currentAccount)) {
            setRole("Manufacturer");
          } else if (await newContract.hasRole(DISTRIBUTOR_ROLE, currentAccount)) {
            setRole("Distributor");
          } else if (await newContract.hasRole(PHARMACY_ROLE, currentAccount)) {
            setRole("Pharmacy");
          } else {
            setRole("None");
          }
        }
      } catch (err) {
        console.error("Error fetching role:", err);
        // Last resort: try hasRole for admin
        try {
          const ADMIN_ROLE = ethers.ZeroHash;
          const isAdmin = await newContract.hasRole(ADMIN_ROLE, currentAccount);
          setRole(isAdmin ? "Admin" : "None");
        } catch {
          setRole("None");
        }
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      if (err.code === 4001) {
        toast.error("Connection request rejected.");
      } else {
        toast.error("Failed to connect wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Web3Context.Provider
      value={{
        account,
        isConnecting,
        role,
        contract,
        provider,
        signer,
        connectWallet,
        isWrongNetwork,
        contractDeployed,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
