// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IRecomTokenFactory {
    function deployToken(
        address collection,
        address creator,
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata bio,
        string calldata socialX,
        string calldata socialGithub,
        string calldata socialFarcaster,
        uint256 feeBps
    ) external payable returns (address);
}

/**
 * @title RecomNFT
 * @notice NFT collection contract for Recomendasi platform
 * @dev Supports up to 6 photo slots, 5 rarity tiers, bonding curve, scheduling
 */
contract RecomNFT is ERC1155, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // ─── Constants ──────────────────────────────────────────────────────────────
    uint256 public constant MAX_SUPPLY = 100;
    uint256 public constant PRE_BONDING_SELL_FEE_BPS = 5000; // 50%
    uint256 public constant BUY_FEE_BPS = 150;  // 1.5%
    uint256 public constant SELL_FEE_BPS = 150; // 1.5%
    uint256 public constant CREATOR_FEE_BPS = 100;   // 1% of trade volume
    uint256 public constant PLATFORM_TRADE_FEE_BPS = 20; // 0.2%
    uint256 public constant KAS_FEE_BPS = 20;        // 0.2% maintenance
    uint256 public constant AIRDROP_FEE_BPS = 10;    // 0.1%
    uint256 public constant MIN_TOKEN_FEE_BPS = 150; // 1.5% base
    uint256 public constant MAX_TOKEN_FEE_BPS = 350; // 3.5% cap
    uint256 public constant MIN_TTL = 10 minutes;
    uint256 public constant MAX_TTL = 14 days;

    // ─── Rarity ─────────────────────────────────────────────────────────────────
    // Rarities are assigned all at once at sellout via _revealShuffle (exact
    // rarityDistribution), never per-mint.
    enum Rarity { Common, Uncommon, Rare, Epic, Legendary, Mythic }

    // ─── Collection Metadata ─────────────────────────────────────────────────────
    struct CollectionInfo {
        string name;
        string ticker;
        string bio;
        string socialX;
        string socialGithub;
        string socialFarcaster;
        string[6] photoURIs;  // max 6 photos, min 3 required
        uint8 photoCount;
        address creator;
        uint256 mintPrice;    // user-set price in ETH (can be 0)
        uint256 platformFeeETH; // flat platform fee per mint, set from launchpad (0.0003 ETH)
        bool bondingComplete;
        address tokenAddress;
        bool tokenEnabled;    // creator chose to deploy a token at bonding
        uint256 tokenFeeBps;  // swap fee for the token: 150 (1.5%) to 350 (3.5%)
    }

    CollectionInfo public info;

    // ─── Mint Schedule ───────────────────────────────────────────────────────────
    uint256 public mintStartTime;  // UTC unix timestamp
    uint256 public mintEndTime;    // startTime + TTL
    bool public mintScheduled;
    bool public mintOpen;

    // ─── Allowlist Phases (0=Team, 1=GTD, 2=FCFS, 3=Public) ──────────────────────
    struct Phase {
        bytes32 merkleRoot;   // 0x0 = open to all (public, no proof)
        uint256 startTime;    // UTC unix
        uint256 endTime;      // UTC unix
        uint256 maxPerWallet; // 0 = unlimited
    }
    Phase[4] public phases;
    bool public phasesConfigured;
    string public allowlistCID; // IPFS CID for full address lists
    mapping(uint8 => mapping(address => uint256)) public mintedInPhase;

    // ─── Reveal ───────────────────────────────────────────────────────────────────
    bool public revealed;
    uint256 public revealSeed;
    uint256 public bondingBlock; // block at sellout; reveal seed drawn from a later block
    uint256[2] public packedRarity; // 100 tokens x 3 bits, packed into 2 slots

    // Exact rarity distribution (must sum to MAX_SUPPLY=100)
    // [Common, Uncommon, Rare, Epic, Legendary, Mythic]
    uint8[6] private rarityDistribution = [46, 30, 15, 5, 1, 3];

    // ─── Supply & Pool ───────────────────────────────────────────────────────────
    uint256 public totalMinted;
    uint256 public poolBalance; // ETH in bonding pool
    uint256 public totalOffersEscrow; // ETH held for open collection offers

    // Token ID => owner mapping for marketplace
    mapping(uint256 => address) public tokenOwner;
    mapping(uint256 => uint256) public tokenListPrice;  // 0 = not listed
    mapping(uint256 => uint256) public tokenListExpiry; // 0 = no expiry
    mapping(uint256 => uint256) public tokenLastSalePrice;

    // Collection-level offers: offerer => amountOffered (pending ETH)
    mapping(address => uint256) public collectionOffer;

    // ─── Platform ────────────────────────────────────────────────────────────────
    address public platformTreasury;
    address public airdropVault;
    address public kasWallet;
    IRecomTokenFactory public tokenFactory;
    address public launchpad;

    // ─── Events ──────────────────────────────────────────────────────────────────
    event CollectionCreated(address indexed creator, string name, string ticker);
    event MintScheduled(uint256 startTime, uint256 endTime);
    event MintOpened();
    event NFTMinted(address indexed minter, uint256 tokenId, Rarity rarity, uint256 price);
    event BondingComplete(address tokenAddress);
    event NFTListed(uint256 indexed tokenId, uint256 price, uint256 expiry, address seller);
    event NFTListingCancelled(uint256 indexed tokenId, address seller);
    event NFTSold(uint256 indexed tokenId, uint256 price, address from, address to);
    event PreBondingSell(uint256 indexed tokenId, address seller, uint256 returned);
    event CollectionOfferMade(address indexed offerer, uint256 amount);
    event CollectionOfferCancelled(address indexed offerer, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────────
    constructor(
        address _creator,
        string memory _name,
        string memory _ticker,
        string memory _bio,
        string[6] memory _photoURIs,
        uint8 _photoCount,
        string memory _socialX,
        string memory _socialGithub,
        string memory _socialFarcaster,
        uint256 _mintPriceWei,
        uint256 _platformFeeWei,
        bool _tokenEnabled,
        uint256 _tokenFeeBps,
        address _platformTreasury,
        address _airdropVault,
        address _kasWallet,
        address _tokenFactory,
        address _launchpad
    ) ERC1155("") Ownable(_creator) {
        require(_photoCount >= 3 && _photoCount <= 6, "Need 3-6 photos");
        if (_tokenEnabled) {
            require(
                _tokenFeeBps >= MIN_TOKEN_FEE_BPS && _tokenFeeBps <= MAX_TOKEN_FEE_BPS,
                "Fee out of range"
            );
        }

        info.name = _name;
        info.ticker = _ticker;
        info.bio = _bio;
        info.photoURIs = _photoURIs;
        info.photoCount = _photoCount;
        info.socialX = _socialX;
        info.socialGithub = _socialGithub;
        info.socialFarcaster = _socialFarcaster;
        info.creator = _creator;
        info.mintPrice = _mintPriceWei;
        info.platformFeeETH = _platformFeeWei;
        info.tokenEnabled = _tokenEnabled;
        info.tokenFeeBps = _tokenEnabled ? _tokenFeeBps : 0;

        platformTreasury = _platformTreasury;
        airdropVault = _airdropVault;
        kasWallet = _kasWallet;
        tokenFactory = IRecomTokenFactory(_tokenFactory);
        launchpad = _launchpad;

        emit CollectionCreated(_creator, _name, _ticker);
    }

    // ─── Scheduling ──────────────────────────────────────────────────────────────

    modifier onlyOwnerOrLaunchpad() {
        require(msg.sender == owner() || msg.sender == launchpad, "Not authorized");
        _;
    }

    /**
     * @notice Schedule mint for a future UTC time with optional TTL
     * @param _startTime Unix timestamp (UTC) for mint open
     * @param _ttlSeconds Duration in seconds (MIN_TTL to MAX_TTL), 0 = no expiry
     */
    function scheduleMint(uint256 _startTime, uint256 _ttlSeconds) external onlyOwnerOrLaunchpad {
        require(!mintOpen, "Already open");
        require(_startTime > block.timestamp, "Start must be future");
        if (_ttlSeconds > 0) {
            require(_ttlSeconds >= MIN_TTL, "TTL too short (min 10min)");
            require(_ttlSeconds <= MAX_TTL, "TTL too long (max 14 days)");
            mintEndTime = _startTime + _ttlSeconds;
        }
        mintStartTime = _startTime;
        mintScheduled = true;
        emit MintScheduled(_startTime, mintEndTime);
    }

    /**
     * @notice Open mint immediately (no schedule)
     */
    function openMintNow(uint256 _ttlSeconds) external onlyOwnerOrLaunchpad {
        require(!mintOpen, "Already open");
        mintStartTime = block.timestamp;
        if (_ttlSeconds > 0) {
            require(_ttlSeconds >= MIN_TTL, "TTL too short");
            require(_ttlSeconds <= MAX_TTL, "TTL too long");
            mintEndTime = block.timestamp + _ttlSeconds;
        }
        mintOpen = true;
        emit MintOpened();
    }

    /**
     * @notice Trigger open if scheduled time has passed
     */
    function triggerMintOpen() external {
        require(mintScheduled && !mintOpen, "Not scheduled or already open");
        require(block.timestamp >= mintStartTime, "Not time yet");
        mintOpen = true;
        emit MintOpened();
    }

    // ─── Phase Management ─────────────────────────────────────────────────────────

    /**
     * @notice Configure 4 mint phases (Team, GTD, FCFS, Public). Called once by launchpad.
     * @dev Pass merkleRoot 0x0 for a phase with no allowlist (public).
     *      Team phase (index 0) is for the creator's team before public launch.
     */
    function setupPhases(
        bytes32[4] calldata _roots,
        uint256[4] calldata _starts,
        uint256[4] calldata _ends,
        uint256[4] calldata _maxPerWallet,
        string calldata _allowlistCID
    ) external onlyOwnerOrLaunchpad {
        require(!phasesConfigured, "Phases already set");
        for (uint8 i = 0; i < 4; i++) {
            // Sanity-check ordering so a fat-fingered config cannot create a
            // dead phase (start >= end) or an out-of-order / overlapping window.
            // currentPhaseId() returns the lowest active index, so requiring
            // start[i] >= end[i-1] keeps phases sequential and non-overlapping.
            require(_starts[i] < _ends[i], "phase start >= end");
            if (i > 0) require(_starts[i] >= _ends[i - 1], "phase overlap/disorder");
            phases[i] = Phase({
                merkleRoot: _roots[i],
                startTime: _starts[i],
                endTime: _ends[i],
                maxPerWallet: _maxPerWallet[i]
            });
        }
        allowlistCID = _allowlistCID;
        phasesConfigured = true;
        mintStartTime = _starts[0];
        mintEndTime = _ends[3];
    }

    /**
     * @notice Returns the currently active phase id (0=Team,1=GTD,2=FCFS,3=Public),
     *         or reverts if none active.
     */
    function currentPhaseId() public view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) {
            if (block.timestamp >= phases[i].startTime && block.timestamp <= phases[i].endTime) {
                return i;
            }
        }
        revert("No active phase");
    }

    function hasActivePhase() public view returns (bool) {
        for (uint8 i = 0; i < 4; i++) {
            if (block.timestamp >= phases[i].startTime && block.timestamp <= phases[i].endTime) {
                return true;
            }
        }
        return false;
    }

    function isEligible(uint8 _phaseId, address _wallet, bytes32[] calldata _proof) public view returns (bool) {
        require(_phaseId < 4, "Bad phase");
        bytes32 root = phases[_phaseId].merkleRoot;
        if (root == bytes32(0)) return true; // public
        bytes32 leaf = keccak256(abi.encodePacked(_wallet));
        return MerkleProof.verify(_proof, root, leaf);
    }

    function remainingForWallet(uint8 _phaseId, address _wallet) public view returns (uint256) {
        require(_phaseId < 4, "Bad phase");
        uint256 cap = phases[_phaseId].maxPerWallet;
        if (cap == 0) return type(uint256).max;
        uint256 used = mintedInPhase[_phaseId][_wallet];
        return cap > used ? cap - used : 0;
    }

    // ─── Minting ─────────────────────────────────────────────────────────────────

    /**
     * @notice Mint an NFT. Rarity assigned pseudo-randomly on-chain.
     */
    function mint(uint256 quantity, bytes32[] calldata proof) external payable nonReentrant {
        require(phasesConfigured, "Phases not set");
        require(!info.bondingComplete, "Bonding complete");
        require(quantity > 0, "Qty must be > 0");
        require(totalMinted + quantity <= MAX_SUPPLY, "Exceeds supply");

        // Determine active phase
        uint8 phaseId = currentPhaseId();
        Phase storage ph = phases[phaseId];

        // Allowlist check (public phase has root 0x0 -> always eligible)
        if (ph.merkleRoot != bytes32(0)) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            require(MerkleProof.verify(proof, ph.merkleRoot, leaf), "Not allowlisted");
        }

        // Per-wallet cap for this phase (Team phase is always capped if configured)
        if (ph.maxPerWallet > 0) {
            require(
                mintedInPhase[phaseId][msg.sender] + quantity <= ph.maxPerWallet,
                "Exceeds wallet limit"
            );
        }

        uint256 unitPrice = info.mintPrice + info.platformFeeETH;
        uint256 totalRequired = unitPrice * quantity;
        require(msg.value >= totalRequired, "Insufficient ETH");

        // Platform fee (per unit) to treasury
        uint256 totalPlatformFee = info.platformFeeETH * quantity;
        if (totalPlatformFee > 0) {
            (bool ok,) = platformTreasury.call{value: totalPlatformFee}("");
            require(ok, "Platform fee failed");
        }

        // Mint price portion to pool
        poolBalance += (totalRequired - totalPlatformFee);

        // Mint `quantity` NFTs (rarity assigned later at reveal)
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalMinted + 1;
            tokenOwner[tokenId] = msg.sender;
            totalMinted++;
            _mint(msg.sender, tokenId, 1, "");
            emit NFTMinted(msg.sender, tokenId, Rarity.Common, unitPrice);
        }

        mintedInPhase[phaseId][msg.sender] += quantity;

        // Trigger bonding + reveal when sold out
        if (totalMinted == MAX_SUPPLY) {
            _completeBonding();
        }

        // Refund excess
        if (msg.value > totalRequired) {
            (bool refund,) = msg.sender.call{value: msg.value - totalRequired}("");
            require(refund, "Refund failed");
        }
    }

    /**
     * @notice Sell NFT back to pool PRE-bonding (50% fee penalty)
     */
    function sellPreBonding(uint256 _tokenId) external nonReentrant {
        require(!info.bondingComplete, "Use marketplace post-bonding");
        require(tokenOwner[_tokenId] == msg.sender, "Not owner");
        require(balanceOf(msg.sender, _tokenId) >= 1, "No balance");

        uint256 pricePerToken = poolBalance / totalMinted;
        uint256 penalty = (pricePerToken * PRE_BONDING_SELL_FEE_BPS) / 10000;
        uint256 returned = pricePerToken - penalty;

        // Remove the full token share from the pool; user gets their part back,
        // the 50% penalty goes to the platform wallet.
        poolBalance -= pricePerToken;
        totalMinted--;
        tokenOwner[_tokenId] = address(0);

        _burn(msg.sender, _tokenId, 1);

        (bool ok,) = msg.sender.call{value: returned}("");
        require(ok, "Transfer failed");

        (bool toPlat,) = platformTreasury.call{value: penalty}("");
        require(toPlat, "Penalty transfer failed");

        emit PreBondingSell(_tokenId, msg.sender, returned);
    }

    // ─── Bonding Completion ───────────────────────────────────────────────────────

    function _completeBonding() internal {
        info.bondingComplete = true;

        // Record the sellout block. The reveal seed is drawn from a LATER block's
        // hash (see _maybeReveal), so the final minter cannot compute their rarity
        // in the same transaction and grind for Mythic.
        bondingBlock = block.number;

        // NFT-only collection: no token, no pool. The mint ETH stays in the
        // contract for the creator to withdraw. Marketplace still unlocks.
        if (!info.tokenEnabled) {
            emit BondingComplete(address(0));
            return;
        }

        // Deploy token via factory — uses Mythic photo (last photo added)
        string memory mythicPhoto = info.photoURIs[info.photoCount - 1];

        // Send 20% of the accounted mint pool as pool seed — rest stays for the
        // creator to claim. Use poolBalance (not address(this).balance) so any
        // in-flight overpayment being refunded this tx is never counted.
        uint256 poolSeed = poolBalance / 5;
        uint256 feeBps = info.tokenFeeBps;
        address tokenAddr;
        try tokenFactory.deployToken{value: poolSeed}(
            address(this),
            info.creator,
            info.name,
            info.ticker,
            mythicPhoto,
            info.bio,
            info.socialX,
            info.socialGithub,
            info.socialFarcaster,
            feeBps
        ) returns (address deployed) {
            tokenAddr = deployed;
        } catch {
            // Pool creation failed — bonding still completes, token deploy without pool
            tokenAddr = tokenFactory.deployToken(
                address(this),
                info.creator,
                info.name,
                info.ticker,
                mythicPhoto,
                info.bio,
                info.socialX,
                info.socialGithub,
                info.socialFarcaster,
                feeBps
            );
        }

        info.tokenAddress = tokenAddr;
        emit BondingComplete(tokenAddr);
    }

    // ─── Reveal / Rarity (view-based, computed from revealSeed) ───────────────────

    /**
     * @notice Fisher-Yates shuffle of the exact rarity distribution, packed into
     *         2 storage slots (100 tokens x 3 bits each). Runs once at sellout.
     */
    function _revealShuffle() internal {
        // Build exact rarity array: index 0..99, values 0..5 (rarity enum)
        uint8[100] memory arr;
        uint256 idx = 0;
        for (uint8 r = 0; r < 6; r++) {
            uint8 count = rarityDistribution[r];
            for (uint8 c = 0; c < count; c++) {
                arr[idx] = r;
                idx++;
            }
        }
        // idx should now equal 100 (MAX_SUPPLY)

        // Fisher-Yates shuffle using revealSeed
        for (uint256 i = 99; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(revealSeed, i))) % (i + 1);
            (arr[i], arr[j]) = (arr[j], arr[i]);
        }

        // Pack into 2 uint256 slots: token positions 0..84 in slot0, 85..99 in slot1
        // Each rarity takes 3 bits. 85 entries * 3 = 255 bits fits slot0; rest slot1.
        uint256 slot0;
        uint256 slot1;
        for (uint256 i = 0; i < 100; i++) {
            uint256 shift = (i % 85) * 3;
            if (i < 85) {
                slot0 |= uint256(arr[i]) << shift;
            } else {
                slot1 |= uint256(arr[i]) << shift;
            }
        }
        packedRarity[0] = slot0;
        packedRarity[1] = slot1;
    }


    /**
     * @notice Draw the reveal seed from a block mined AFTER sellout and shuffle.
     *         Permissionless; auto-triggered by the first marketplace action.
     *         Because blockhash(bondingBlock) is not known during the bonding
     *         transaction, the final minter cannot grind for rare tiers.
     */
    function revealRarities() public {
        _maybeReveal();
    }

    function _maybeReveal() internal {
        if (revealed || !info.bondingComplete || bondingBlock == 0) return;
        if (block.number <= bondingBlock) return; // need the sellout block mined

        bytes32 bh = blockhash(bondingBlock); // 0 if older than 256 blocks
        revealSeed = uint256(keccak256(abi.encodePacked(
            bh,
            block.prevrandao, // unpredictable fallback if bh == 0
            address(this),
            totalMinted
        )));
        _revealShuffle();
        revealed = true;
    }

    /**
     * @notice Get the revealed rarity for a token. Returns Common as placeholder
     *         until revealed. Deterministic from revealSeed once revealed.
     * @dev Rarity slots are derived from the seed by assigning the rarest tiers
     *      to pseudo-random token positions, respecting raritySupplyCaps.
     */
    function getRarity(uint256 _tokenId) public view returns (Rarity) {
        require(_tokenId >= 1 && _tokenId <= totalMinted, "Bad tokenId");
        if (!revealed) return Rarity.Common; // unrevealed placeholder

        // Token #N is stored at position N-1 in the packed array.
        uint256 pos = _tokenId - 1;
        uint256 slot = pos < 85 ? packedRarity[0] : packedRarity[1];
        uint256 shift = (pos % 85) * 3;
        uint256 val = (slot >> shift) & 0x7; // 3 bits -> 0..5
        return Rarity(val);
    }

    /**
     * @notice Whether the collection has been revealed.
     */
    function isRevealed() external view returns (bool) {
        return revealed;
    }

    // ─── Post-Bonding Marketplace ─────────────────────────────────────────────────

    /**
     * @notice List an NFT for sale with optional expiry timestamp.
     * @param _expiry Unix timestamp after which listing auto-expires; 0 = no expiry.
     */
    function listNFT(uint256 _tokenId, uint256 _price, uint256 _expiry) external {
        require(info.bondingComplete, "Bonding not complete yet");
        _maybeReveal();
        require(tokenOwner[_tokenId] == msg.sender, "Not owner");
        require(_price > 0, "Price must be > 0");
        require(_expiry == 0 || _expiry > block.timestamp, "Expiry must be future");
        tokenListPrice[_tokenId] = _price;
        tokenListExpiry[_tokenId] = _expiry;
        emit NFTListed(_tokenId, _price, _expiry, msg.sender);
    }

    function cancelListing(uint256 _tokenId) external {
        require(tokenOwner[_tokenId] == msg.sender, "Not owner");
        require(tokenListPrice[_tokenId] > 0, "Not listed");
        tokenListPrice[_tokenId] = 0;
        tokenListExpiry[_tokenId] = 0;
        emit NFTListingCancelled(_tokenId, msg.sender);
    }

    function buyNFT(uint256 _tokenId) external payable nonReentrant {
        require(info.bondingComplete, "Bonding not complete");
        _maybeReveal();
        uint256 listPrice = tokenListPrice[_tokenId];
        require(listPrice > 0, "Not listed");
        uint256 expiry = tokenListExpiry[_tokenId];
        require(expiry == 0 || block.timestamp <= expiry, "Listing expired");
        require(msg.value >= listPrice, "Insufficient ETH");

        address seller = tokenOwner[_tokenId];
        require(seller != msg.sender, "Cannot buy own NFT");

        // Calculate fees on buy side
        uint256 creatorFee = (listPrice * CREATOR_FEE_BPS) / 10000;         // 1%
        uint256 platformFee = (listPrice * PLATFORM_TRADE_FEE_BPS) / 10000; // 0.2%
        uint256 kasFee = (listPrice * KAS_FEE_BPS) / 10000;                 // 0.2%
        uint256 airdropFee = (listPrice * AIRDROP_FEE_BPS) / 10000;         // 0.1%
        uint256 totalFee = creatorFee + platformFee + kasFee + airdropFee;
        uint256 sellerReceives = listPrice - totalFee;

        // Transfer
        tokenOwner[_tokenId] = msg.sender;
        tokenListPrice[_tokenId] = 0;
        tokenListExpiry[_tokenId] = 0;
        tokenLastSalePrice[_tokenId] = listPrice;
        _safeTransferFrom(seller, msg.sender, _tokenId, 1, "");

        // Distribute
        (bool toSeller,) = seller.call{value: sellerReceives}("");
        require(toSeller, "Seller payment failed");
        (bool toCreator,) = info.creator.call{value: creatorFee}("");
        require(toCreator, "Creator fee failed");
        (bool toPlatform,) = platformTreasury.call{value: platformFee}("");
        require(toPlatform, "Platform fee failed");
        (bool toKas,) = kasWallet.call{value: kasFee}("");
        require(toKas, "Kas fee failed");
        (bool toAirdrop,) = airdropVault.call{value: airdropFee}("");
        require(toAirdrop, "Airdrop fee failed");

        // Refund excess
        if (msg.value > listPrice) {
            (bool refund,) = msg.sender.call{value: msg.value - listPrice}("");
            require(refund, "Refund failed");
        }

        emit NFTSold(_tokenId, listPrice, seller, msg.sender);
    }

    /**
     * @notice Deposit ETH as a standing offer for any NFT in this collection.
     *         Any owner can call acceptOffer() to sell to the highest offerer.
     */
    function makeCollectionOffer() external payable nonReentrant {
        require(info.bondingComplete, "Bonding not complete");
        require(msg.value > 0, "No ETH sent");
        collectionOffer[msg.sender] += msg.value;
        totalOffersEscrow += msg.value;
        emit CollectionOfferMade(msg.sender, collectionOffer[msg.sender]);
    }

    function cancelCollectionOffer() external nonReentrant {
        uint256 amount = collectionOffer[msg.sender];
        require(amount > 0, "No offer");
        collectionOffer[msg.sender] = 0;
        totalOffersEscrow -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "Refund failed");
        emit CollectionOfferCancelled(msg.sender, amount);
    }

    function acceptCollectionOffer(uint256 _tokenId, address _offerer) external nonReentrant {
        require(info.bondingComplete, "Bonding not complete");
        _maybeReveal();
        require(tokenOwner[_tokenId] == msg.sender, "Not owner");
        uint256 offerAmount = collectionOffer[_offerer];
        require(offerAmount > 0, "No offer from address");

        collectionOffer[_offerer] = 0;
        totalOffersEscrow -= offerAmount;
        tokenOwner[_tokenId] = _offerer;
        tokenListPrice[_tokenId] = 0;
        tokenListExpiry[_tokenId] = 0;
        tokenLastSalePrice[_tokenId] = offerAmount;
        _safeTransferFrom(msg.sender, _offerer, _tokenId, 1, "");

        uint256 creatorFee = (offerAmount * CREATOR_FEE_BPS) / 10000;
        uint256 platformFee = (offerAmount * PLATFORM_TRADE_FEE_BPS) / 10000;
        uint256 kasFee = (offerAmount * KAS_FEE_BPS) / 10000;
        uint256 airdropFee = (offerAmount * AIRDROP_FEE_BPS) / 10000;
        uint256 sellerReceives = offerAmount - creatorFee - platformFee - kasFee - airdropFee;

        (bool toSeller,) = msg.sender.call{value: sellerReceives}("");
        require(toSeller, "Seller payment failed");
        (bool toCreator,) = info.creator.call{value: creatorFee}("");
        require(toCreator, "Creator fee failed");
        (bool toPlatform,) = platformTreasury.call{value: platformFee}("");
        require(toPlatform, "Platform fee failed");
        (bool toKas,) = kasWallet.call{value: kasFee}("");
        require(toKas, "Kas fee failed");
        (bool toAirdrop,) = airdropVault.call{value: airdropFee}("");
        require(toAirdrop, "Airdrop fee failed");

        emit NFTSold(_tokenId, offerAmount, msg.sender, _offerer);
    }

    // ─── View Functions ───────────────────────────────────────────────────────────

    /**
     * @dev Keep the marketplace's tokenOwner + listings in sync with real ERC1155
     *      balances on every move, including direct safeTransferFrom by holders.
     *      Without this a raw transfer would leave a stale owner/listing, locking
     *      the new holder out of the built-in marketplace and leaving listings
     *      that revert on buy.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        super._update(from, to, ids, values);
        // Only resync on real transfers between accounts (not mint or burn, which
        // the mint/sell paths already set explicitly).
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                uint256 id = ids[i];
                tokenOwner[id] = to;
                tokenListPrice[id] = 0;
                tokenListExpiry[id] = 0;
            }
        }
    }

    function uri(uint256 _tokenId) public view override returns (string memory) {
        Rarity r = getRarity(_tokenId);
        // Return appropriate photo based on rarity index
        uint8 photoIdx = uint8(r);
        if (photoIdx >= info.photoCount) photoIdx = info.photoCount - 1;
        return info.photoURIs[photoIdx];
    }

    function getMintStatus() external view returns (
        bool isOpen,
        bool isScheduled,
        uint256 startTime,
        uint256 endTime,
        uint256 minted,
        uint256 remaining,
        bool bonded
    ) {
        return (mintOpen, mintScheduled, mintStartTime, mintEndTime, totalMinted, MAX_SUPPLY - totalMinted, info.bondingComplete);
    }

    function getCollectionInfo() external view returns (CollectionInfo memory) {
        return info;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────────

    function updatePlatformFeeETH(uint256 _newFeeWei) external {
        require(msg.sender == platformTreasury, "Only platform");
        info.platformFeeETH = _newFeeWei;
    }

    function withdrawEmergency() external onlyOwner nonReentrant {
        require(info.bondingComplete, "Pool not released");
        // Never touch ETH escrowed for open collection offers — that belongs to
        // the offerers until they cancel or an owner accepts.
        uint256 claimable = address(this).balance - totalOffersEscrow;
        (bool ok,) = owner().call{value: claimable}("");
        require(ok);
    }
}
