// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RecomVault
 * @notice Manages token airdrop and burn schedule after bonding
 * @dev Schedule:
 *   Airdrop (5% total, distributed to top-100 trade losers):
 *     Day 1:  1%
 *     Day 7:  1%
 *     Day 14: 1%
 *     Day 28: 1%
 *     Day 56: 1%
 *   Burn (45% total):
 *     Day 1:  9%
 *     Day 7:  9%
 *     Day 14: 9%
 *     Day 28: 9%
 *     Day 56: 9%
 */
contract RecomVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Schedule ─────────────────────────────────────────────────────────────────
    uint256[5] public SCHEDULE_DAYS = [1, 7, 14, 28, 56];
    uint256 public constant AIRDROP_PER_EPOCH_BPS = 100;  // 1% of total supply per epoch
    uint256 public constant BURN_PER_EPOCH_BPS = 900;     // 9% of total supply per epoch
    uint256 public constant TOP_LOSERS_COUNT = 100;        // airdrop to top 100 losers

    // ─── State per token ─────────────────────────────────────────────────────────
    struct VaultEntry {
        address token;
        address creator;
        uint256 deployedAt;       // timestamp when lockVault was called
        uint256 totalSupply;
        uint256[5] epochExecuted; // 0 = not done, 1 = done
        bool initialized;
    }

    mapping(address => VaultEntry) public vaults; // token => entry
    address[] public managedTokens;

    // Airdrop recipients per token per epoch: token => epoch => addresses
    mapping(address => mapping(uint256 => address[])) public airdropRecipients;
    mapping(address => mapping(uint256 => uint256[])) public airdropAmounts;

    // Platform roles
    address public platform; // can set airdrop recipients
    address public airdropOracle; // backend submits loser list

    // ─── Events ──────────────────────────────────────────────────────────────────
    event VaultInitialized(address indexed token, uint256 totalLocked);
    event AirdropExecuted(address indexed token, uint256 epoch, uint256 totalAmount, uint256 recipients);
    event BurnExecuted(address indexed token, uint256 epoch, uint256 burnAmount);
    event EpochReady(address indexed token, uint256 epoch, uint256 dayMark);

    // ─── Constructor ─────────────────────────────────────────────────────────────
    constructor(address _platform, address _airdropOracle) Ownable(_platform) {
        platform = _platform;
        airdropOracle = _airdropOracle;
    }

    // ─── Called by RecomToken ─────────────────────────────────────────────────────

    function notifyDeployment(address token, address creator) external {
        // Only the token contract can register itself (via lockVault). Otherwise
        // anyone could pre-init a token and brick its real lockVault call.
        require(msg.sender == token, "Only token");
        require(!vaults[token].initialized, "Already initialized");
        uint256 supply = IERC20(token).totalSupply();
        uint256 locked = IERC20(token).balanceOf(address(this));

        vaults[token] = VaultEntry({
            token: token,
            creator: creator,
            deployedAt: block.timestamp,
            totalSupply: supply,
            epochExecuted: [uint256(0), 0, 0, 0, 0],
            initialized: true
        });

        managedTokens.push(token);
        emit VaultInitialized(token, locked);
    }

    // ─── Oracle: Submit Losers ────────────────────────────────────────────────────

    /**
     * @notice Backend submits top-100 trade losers for an epoch's airdrop
     * @dev Called by airdropOracle before executeEpoch
     */
    function submitAirdropRecipients(
        address token,
        uint256 epochIndex,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(msg.sender == airdropOracle, "Not oracle");
        require(vaults[token].initialized, "Vault not initialized");
        require(epochIndex < 5, "Invalid epoch");
        require(recipients.length <= TOP_LOSERS_COUNT, "Too many recipients");
        require(recipients.length == amounts.length, "Length mismatch");

        // Validate total amounts == airdrop allocation for this epoch
        uint256 epochAirdrop = (vaults[token].totalSupply * AIRDROP_PER_EPOCH_BPS) / 10000;
        uint256 sumAmounts;
        for (uint256 i = 0; i < amounts.length; i++) {
            sumAmounts += amounts[i];
        }
        require(sumAmounts <= epochAirdrop, "Exceeds epoch allocation");

        airdropRecipients[token][epochIndex] = recipients;
        airdropAmounts[token][epochIndex] = amounts;
    }

    // ─── Execute Epoch ────────────────────────────────────────────────────────────

    /**
     * @notice Execute airdrop + burn for a given epoch
     * @dev Can be called by anyone once the epoch day has passed
     */
    function executeEpoch(address token, uint256 epochIndex) external nonReentrant {
        VaultEntry storage v = vaults[token];
        require(v.initialized, "Not initialized");
        require(epochIndex < 5, "Invalid epoch index");
        require(v.epochExecuted[epochIndex] == 0, "Already executed");

        uint256 epochDay = SCHEDULE_DAYS[epochIndex];
        uint256 epochTime = v.deployedAt + (epochDay * 1 days);
        require(block.timestamp >= epochTime, "Epoch not ready yet");

        IERC20 tokenContract = IERC20(token);
        uint256 totalSupply = v.totalSupply;

        // ── Airdrop ──
        uint256 airdropTotal = (totalSupply * AIRDROP_PER_EPOCH_BPS) / 10000;
        address[] memory recipients = airdropRecipients[token][epochIndex];
        uint256[] memory amounts = airdropAmounts[token][epochIndex];

        uint256 distributed;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0) && amounts[i] > 0) {
                tokenContract.safeTransfer(recipients[i], amounts[i]);
                distributed += amounts[i];
            }
        }

        // Any undistributed airdrop tokens get burned
        uint256 leftoverAirdrop = airdropTotal - distributed;

        // ── Burn ──
        uint256 burnAmount = (totalSupply * BURN_PER_EPOCH_BPS) / 10000;
        burnAmount += leftoverAirdrop; // burn leftover airdrop too

        // Send to dead address (burn)
        address dead = address(0x000000000000000000000000000000000000dEaD);
        uint256 vaultBalance = tokenContract.balanceOf(address(this));
        uint256 actualBurn = burnAmount > vaultBalance ? vaultBalance : burnAmount;
        if (actualBurn > 0) {
            tokenContract.safeTransfer(dead, actualBurn);
        }

        v.epochExecuted[epochIndex] = 1;

        emit AirdropExecuted(token, epochIndex, distributed, recipients.length);
        emit BurnExecuted(token, epochIndex, actualBurn);
    }

    // ─── Batch Execute ────────────────────────────────────────────────────────────

    function batchExecuteEpoch(address[] calldata tokens, uint256 epochIndex) external {
        for (uint256 i = 0; i < tokens.length; i++) {
            VaultEntry storage v = vaults[tokens[i]];
            if (!v.initialized) continue;
            if (v.epochExecuted[epochIndex] != 0) continue;
            uint256 epochTime = v.deployedAt + (SCHEDULE_DAYS[epochIndex] * 1 days);
            if (block.timestamp < epochTime) continue;
            this.executeEpoch(tokens[i], epochIndex);
        }
    }

    // ─── View ─────────────────────────────────────────────────────────────────────

    function getVaultStatus(address token) external view returns (
        uint256 balance,
        uint256[5] memory executed,
        uint256[5] memory epochTimes,
        bool[5] memory ready
    ) {
        VaultEntry storage v = vaults[token];
        balance = IERC20(token).balanceOf(address(this));
        executed = v.epochExecuted;
        for (uint256 i = 0; i < 5; i++) {
            epochTimes[i] = v.deployedAt + (SCHEDULE_DAYS[i] * 1 days);
            ready[i] = block.timestamp >= epochTimes[i] && executed[i] == 0;
        }
    }

    function getNextEpoch(address token) external view returns (uint256 nextIndex, uint256 nextTime, bool hasNext) {
        VaultEntry storage v = vaults[token];
        for (uint256 i = 0; i < 5; i++) {
            if (v.epochExecuted[i] == 0) {
                return (i, v.deployedAt + (SCHEDULE_DAYS[i] * 1 days), true);
            }
        }
        return (0, 0, false);
    }

    function getManagedTokens() external view returns (address[] memory) {
        return managedTokens;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────────

    function updateOracle(address _oracle) external onlyOwner {
        airdropOracle = _oracle;
    }

    function recoverStuck(address token, address to, uint256 amount) external onlyOwner {
        // Safety: only for tokens not managed by vault
        require(!vaults[token].initialized, "Managed token");
        IERC20(token).safeTransfer(to, amount);
    }

    // ─── ETH ─────────────────────────────────────────────────────────────────────
    // Marketplace sales forward a 0.1% airdrop fee in ETH (RecomNFT.buyNFT /
    // acceptCollectionOffer) — without receive() every sale would revert.
    event ETHReceived(address indexed from, uint256 amount);

    receive() external payable {
        emit ETHReceived(msg.sender, msg.value);
    }

    function withdrawETH(address to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Withdraw failed");
    }
}
