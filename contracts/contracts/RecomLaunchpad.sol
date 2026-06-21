// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RecomNFT.sol";
import "./RecomNFTDeployer.sol";

/**
 * @title RecomLaunchpad
 * @notice Entry point for creating NFT collections on Recomendasi
 * @dev Flat platform fee of 0.0003 ETH per mint (no oracle dependency)
 */
contract RecomLaunchpad is Ownable, ReentrancyGuard {

    uint256 public constant PLATFORM_FEE_ETH = 0.0003 ether; // flat platform fee per mint

    // ─── Addresses ───────────────────────────────────────────────────────────────
    address public platformTreasury;
    address public airdropVault;
    address public kasWallet;
    address public tokenFactory;
    RecomNFTDeployer public nftDeployer;

    // ─── Registry ────────────────────────────────────────────────────────────────
    address[] public allCollections;
    mapping(address => address[]) public creatorCollections;
    mapping(address => bool) public isCollection;
    // collection => anti-sniper fee decay window in seconds (0 = off)
    mapping(address => uint256) public collectionDecay;
    // collection => creator fee delivery type (0=ETH, 1=token, 2=both)
    mapping(address => uint8) public collectionFeeType;

    // ─── Events ──────────────────────────────────────────────────────────────────
    event CollectionLaunched(
        address indexed collection,
        address indexed creator,
        string name,
        string ticker,
        uint256 mintPrice,
        uint256 mintStart
    );

    constructor(
        address _platformTreasury,
        address _airdropVault,
        address _kasWallet,
        address _tokenFactory,
        address _nftDeployer
    ) Ownable(msg.sender) {
        platformTreasury = _platformTreasury;
        airdropVault = _airdropVault;
        kasWallet = _kasWallet;
        tokenFactory = _tokenFactory;
        nftDeployer = RecomNFTDeployer(_nftDeployer);
    }

    // ─── Platform Fee ───────────────────────────────────────────────────────────

    /**
     * @notice Flat platform fee per mint (0.0003 ETH)
     */
    function getPlatformFeeETH() public pure returns (uint256) {
        return PLATFORM_FEE_ETH;
    }

    // ─── Create Collection ────────────────────────────────────────────────────────

    struct LaunchParams {
        string name;
        string ticker;
        string bio;
        string[6] photoURIs;
        uint8 photoCount;
        string socialX;
        string socialGithub;
        string socialFarcaster;
        uint256 mintPriceWei;   // 0 = free (creator sets their price, can be 0)
        bool tokenEnabled;      // deploy a token at bonding, or NFT-only
        uint256 tokenFeeBps;    // token swap fee: 150 (1.5%) to 350 (3.5%)
        uint256 decaySeconds;   // anti-sniper fee decay window (0 = off; fee 80%->base over N sec)
        uint8 feeReceiveType;   // creator fee delivery: 0=ETH, 1=token (buyback), 2=both
        // Phase config (0=Team, 1=GTD, 2=FCFS, 3=Public)
        bytes32[4] phaseRoots;     // 0x0 = open/public (no allowlist)
        uint256[4] phaseStarts;    // UTC unix start per phase
        uint256[4] phaseEnds;      // UTC unix end per phase
        uint256[4] phaseMaxPerWallet; // 0 = unlimited
        string allowlistCID;       // IPFS CID of full address lists
    }

    /**
     * @notice Launch a new NFT collection
     * @dev Creator can set mintPrice to 0, but platform fee still applies
     */
    function launchCollection(LaunchParams calldata p) external nonReentrant returns (address collection) {
        require(p.photoCount >= 3 && p.photoCount <= 6, "Need 3-6 photos");
        require(bytes(p.name).length > 0, "Name required");
        require(bytes(p.ticker).length > 0, "Ticker required");

        uint256 platformFeeWei = getPlatformFeeETH();

        collection = nftDeployer.deployNFT(
            msg.sender,
            p.name,
            p.ticker,
            p.bio,
            p.photoURIs,
            p.photoCount,
            p.socialX,
            p.socialGithub,
            p.socialFarcaster,
            p.mintPriceWei,
            platformFeeWei,
            p.tokenEnabled,
            p.tokenFeeBps,
            platformTreasury,
            airdropVault,
            kasWallet,
            tokenFactory
        );

        allCollections.push(collection);
        creatorCollections[msg.sender].push(collection);
        isCollection[collection] = true;
        // Anti-sniper decay window + creator fee delivery type for this collection,
        // read by the factory at bonding (pool registration / splitter creation).
        require(p.feeReceiveType <= 2, "bad fee type");
        collectionDecay[collection] = p.decaySeconds;
        collectionFeeType[collection] = p.feeReceiveType;

        // Configure mint phases (GTD / FCFS / Public)
        RecomNFT(collection).setupPhases(
            p.phaseRoots,
            p.phaseStarts,
            p.phaseEnds,
            p.phaseMaxPerWallet,
            p.allowlistCID
        );

        emit CollectionLaunched(collection, msg.sender, p.name, p.ticker, p.mintPriceWei, p.phaseStarts[0]);
    }

    // ─── View ─────────────────────────────────────────────────────────────────────

    function getAllCollections() external view returns (address[] memory) {
        return allCollections;
    }

    function getCreatorCollections(address creator) external view returns (address[] memory) {
        return creatorCollections[creator];
    }

    function getCollectionCount() external view returns (uint256) {
        return allCollections.length;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────────

    function updateAddresses(
        address _treasury,
        address _vault,
        address _kasWallet,
        address _factory
    ) external onlyOwner {
        platformTreasury = _treasury;
        airdropVault = _vault;
        kasWallet = _kasWallet;
        tokenFactory = _factory;
    }

}
