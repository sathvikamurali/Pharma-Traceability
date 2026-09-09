// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PharmaChain
 * @dev Pharmaceutical supply chain tracking with RBAC, pausability, and reentrancy protection
 */
contract PharmaChain is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant PHARMACY_ROLE = keccak256("PHARMACY_ROLE");

    enum BatchStatus { Active, InTransit, Accepted, Sold }

    struct Batch {
        string batchId;
        string ipfsCid;
        address manufacturer;
        address currentHolder;
        string holderRole;
        BatchStatus status;
        uint256 totalQuantity;
        uint256 registeredAt;
    }

    struct Transfer {
        string batchId;
        address from;
        address to;
        uint256 quantity;
        bool accepted;
        uint256 createdAt;
    }

    mapping(string => Batch) private _batches;
    mapping(string => Transfer[]) private _batchTransfers;

    address[] private _manufacturers;
    address[] private _distributors;
    address[] private _pharmacies;
    string[] private _batchIds;

    // Track which addresses are already added (prevent duplicates in arrays)
    mapping(address => bool) private _isManufacturer;
    mapping(address => bool) private _isDistributor;
    mapping(address => bool) private _isPharmacy;

    event BatchRegistered(string batchId, string ipfsCid, address indexed manufacturer, uint256 quantity, uint256 timestamp);
    event BatchTransferred(string batchId, address indexed from, address indexed to, uint256 quantity, uint256 timestamp);
    event BatchAccepted(string batchId, address indexed by, string role, uint256 timestamp);
    event BatchSold(string batchId, address indexed pharmacy, uint256 timestamp);
    event ParticipantAdded(address indexed account, string role, address indexed addedBy);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── Admin Functions ───────────────────────────────────────────────────────

    function addManufacturer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _grantRole(MANUFACTURER_ROLE, account);
        if (!_isManufacturer[account]) {
            _manufacturers.push(account);
            _isManufacturer[account] = true;
        }
        emit ParticipantAdded(account, "Manufacturer", msg.sender);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Manufacturer Functions ────────────────────────────────────────────────

    function addDistributor(address account) external onlyRole(MANUFACTURER_ROLE) whenNotPaused {
        _grantRole(DISTRIBUTOR_ROLE, account);
        if (!_isDistributor[account]) {
            _distributors.push(account);
            _isDistributor[account] = true;
        }
        emit ParticipantAdded(account, "Distributor", msg.sender);
    }

    function registerBatch(
        string calldata batchId,
        string calldata ipfsCid,
        uint256 quantity
    ) external onlyRole(MANUFACTURER_ROLE) whenNotPaused nonReentrant {
        require(bytes(_batches[batchId].batchId).length == 0, "Batch already exists");
        require(quantity > 0, "Quantity must be > 0");

        _batches[batchId] = Batch({
            batchId: batchId,
            ipfsCid: ipfsCid,
            manufacturer: msg.sender,
            currentHolder: msg.sender,
            holderRole: "Manufacturer",
            status: BatchStatus.Active,
            totalQuantity: quantity,
            registeredAt: block.timestamp
        });
        _batchIds.push(batchId);

        emit BatchRegistered(batchId, ipfsCid, msg.sender, quantity, block.timestamp);
    }

    function transferToDistributor(
        string calldata batchId,
        address distributor,
        uint256 quantity
    ) external onlyRole(MANUFACTURER_ROLE) whenNotPaused nonReentrant {
        Batch storage batch = _batches[batchId];
        require(bytes(batch.batchId).length > 0, "Batch not found");
        require(batch.manufacturer == msg.sender, "Not batch manufacturer");
        require(hasRole(DISTRIBUTOR_ROLE, distributor), "Not a registered distributor");
        require(quantity > 0 && quantity <= batch.totalQuantity, "Invalid quantity");

        _batchTransfers[batchId].push(Transfer({
            batchId: batchId,
            from: msg.sender,
            to: distributor,
            quantity: quantity,
            accepted: false,
            createdAt: block.timestamp
        }));

        batch.status = BatchStatus.InTransit;
        emit BatchTransferred(batchId, msg.sender, distributor, quantity, block.timestamp);
    }

    // ─── Distributor Functions ─────────────────────────────────────────────────

    function addPharmacy(address account) external onlyRole(DISTRIBUTOR_ROLE) whenNotPaused {
        _grantRole(PHARMACY_ROLE, account);
        if (!_isPharmacy[account]) {
            _pharmacies.push(account);
            _isPharmacy[account] = true;
        }
        emit ParticipantAdded(account, "Pharmacy", msg.sender);
    }

    function acceptFromManufacturer(string calldata batchId) external onlyRole(DISTRIBUTOR_ROLE) whenNotPaused nonReentrant {
        Batch storage batch = _batches[batchId];
        require(bytes(batch.batchId).length > 0, "Batch not found");

        Transfer[] storage transfers = _batchTransfers[batchId];
        bool found = false;
        for (uint256 i = 0; i < transfers.length; i++) {
            if (
                transfers[i].to == msg.sender &&
                !transfers[i].accepted &&
                hasRole(MANUFACTURER_ROLE, transfers[i].from)
            ) {
                transfers[i].accepted = true;
                found = true;
                break;
            }
        }
        require(found, "No pending transfer for this distributor");

        batch.currentHolder = msg.sender;
        batch.holderRole = "Distributor";
        batch.status = BatchStatus.Accepted;
        emit BatchAccepted(batchId, msg.sender, "Distributor", block.timestamp);
    }

    function transferToPharmacy(
        string calldata batchId,
        address pharmacy,
        uint256 quantity
    ) external onlyRole(DISTRIBUTOR_ROLE) whenNotPaused nonReentrant {
        Batch storage batch = _batches[batchId];
        require(bytes(batch.batchId).length > 0, "Batch not found");
        require(batch.currentHolder == msg.sender, "Not current holder");
        require(hasRole(PHARMACY_ROLE, pharmacy), "Not a registered pharmacy");
        require(quantity > 0, "Quantity must be > 0");

        _batchTransfers[batchId].push(Transfer({
            batchId: batchId,
            from: msg.sender,
            to: pharmacy,
            quantity: quantity,
            accepted: false,
            createdAt: block.timestamp
        }));

        batch.status = BatchStatus.InTransit;
        emit BatchTransferred(batchId, msg.sender, pharmacy, quantity, block.timestamp);
    }

    // ─── Pharmacy Functions ────────────────────────────────────────────────────

    function acceptFromDistributor(string calldata batchId) external onlyRole(PHARMACY_ROLE) whenNotPaused nonReentrant {
        Batch storage batch = _batches[batchId];
        require(bytes(batch.batchId).length > 0, "Batch not found");

        Transfer[] storage transfers = _batchTransfers[batchId];
        bool found = false;
        for (uint256 i = 0; i < transfers.length; i++) {
            if (
                transfers[i].to == msg.sender &&
                !transfers[i].accepted &&
                hasRole(DISTRIBUTOR_ROLE, transfers[i].from)
            ) {
                transfers[i].accepted = true;
                found = true;
                break;
            }
        }
        require(found, "No pending transfer for this pharmacy");

        batch.currentHolder = msg.sender;
        batch.holderRole = "Pharmacy";
        batch.status = BatchStatus.Accepted;
        emit BatchAccepted(batchId, msg.sender, "Pharmacy", block.timestamp);
    }

    function markAsSold(string calldata batchId) external onlyRole(PHARMACY_ROLE) whenNotPaused nonReentrant {
        Batch storage batch = _batches[batchId];
        require(bytes(batch.batchId).length > 0, "Batch not found");
        require(batch.currentHolder == msg.sender, "Not current holder");
        require(batch.status == BatchStatus.Accepted, "Batch not accepted yet");

        batch.status = BatchStatus.Sold;
        emit BatchSold(batchId, msg.sender, block.timestamp);
    }

    // ─── Read Functions ────────────────────────────────────────────────────────

    function getBatch(string calldata batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    function getBatchTransfers(string calldata batchId) external view returns (Transfer[] memory) {
        return _batchTransfers[batchId];
    }

    function getManufacturers() external view returns (address[] memory) {
        return _manufacturers;
    }

    function getDistributors() external view returns (address[] memory) {
        return _distributors;
    }

    function getPharmacies() external view returns (address[] memory) {
        return _pharmacies;
    }

    function getBatchCount() external view returns (uint256) {
        return _batchIds.length;
    }

    function getBatchIds() external view returns (string[] memory) {
        return _batchIds;
    }

    function getUserRole(address account) external view returns (string memory) {
        if (hasRole(DEFAULT_ADMIN_ROLE, account)) return "Admin";
        if (hasRole(MANUFACTURER_ROLE, account)) return "Manufacturer";
        if (hasRole(DISTRIBUTOR_ROLE, account)) return "Distributor";
        if (hasRole(PHARMACY_ROLE, account)) return "Pharmacy";
        return "None";
    }

    function getContractStats() external view returns (
        uint256 totalManufacturers,
        uint256 totalDistributors,
        uint256 totalPharmacies,
        uint256 totalBatches
    ) {
        return (
            _manufacturers.length,
            _distributors.length,
            _pharmacies.length,
            _batchIds.length
        );
    }
}
