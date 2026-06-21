// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./RecomToken.sol";
import "./OriginFeeSplitter.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {CurrencySettler} from "./lib/CurrencySettler.sol";

interface IOriginFeeHook {
    function registerPool(PoolKey calldata key, address recipient, uint256 feeBps, uint256 decaySeconds) external;
}

// Used to fetch a collection's anti-sniper decay setting at bonding time. The
// collection (RecomNFT) exposes its launchpad, and the launchpad stores the
// per-collection decay window chosen at launch.
interface IRecomNFTForDecay {
    function launchpad() external view returns (address);
}

interface IRecomLaunchpadForDecay {
    function collectionDecay(address collection) external view returns (uint256);
    function collectionFeeType(address collection) external view returns (uint8);
}

/**
 * @title RecomTokenFactory
 * @notice Deploys the per-collection token, its fee splitter, and a Uniswap V4
 *         native-ETH / TOKEN pool with the OriginFeeHook attached. Liquidity is
 *         seeded and left in this contract with no removal path, so it is locked
 *         forever. The pool's own LP fee is 0; the 1.5% trade fee is charged by
 *         the hook and paid out as ETH to the splitter.
 */
contract RecomTokenFactory is Ownable, IUnlockCallback {
    using CurrencySettler for Currency;

    address public platformTreasury;
    address public airdropVault;
    address public kasWallet;

    IPoolManager public immutable poolManager;
    address public immutable feeHook;
    // OriginSwapRouter, used by each token's splitter to buy back the token for
    // creators who chose TOKEN/BOTH fee delivery. Set once after deploy (the router
    // is deployed after the factory). 0 = buyback off (splitters fall back to ETH).
    address public router;

    uint24 public constant LP_FEE = 0; // no LP fee; all trade fee via hook
    int24 public constant TICK_SPACING = 60;

    mapping(address => address) public collectionToToken;
    mapping(address => address) public tokenToCollection;
    mapping(address => address) public tokenToSplitter;
    address[] public allTokens;

    event TokenDeployed(address indexed collection, address indexed token, address creator, string name, string symbol);
    event PoolCreated(address indexed token, address splitter, uint256 ethAmount, uint256 tokenAmount);

    constructor(
        address _platformTreasury,
        address _airdropVault,
        address _kasWallet,
        address _poolManager,
        address _feeHook
    ) Ownable(msg.sender) {
        platformTreasury = _platformTreasury;
        airdropVault = _airdropVault;
        kasWallet = _kasWallet;
        poolManager = IPoolManager(_poolManager);
        feeHook = _feeHook;
    }

    receive() external payable {}

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
    ) external payable returns (address tokenAddress) {
        // Only the collection itself can deploy its own token. Without this an
        // attacker could pre-register any collection's token and permanently
        // brick that collection's bonding completion.
        require(msg.sender == collection, "Caller not collection");
        require(collectionToToken[collection] == address(0), "Token already deployed");

        // Factory receives TOTAL_SUPPLY/2 (liquidity half) from the constructor.
        // The vault half is locked inside the token to the canonical airdropVault.
        RecomToken token = new RecomToken(
            name, symbol, creator, collection, airdropVault,
            imageURI, bio, socialX, socialGithub, socialFarcaster
        );
        tokenAddress = address(token);

        // Read this collection's launch config from its launchpad. Defensive: any
        // failure leaves decay off (0) and fee type ETH (0) so bonding never bricks.
        (uint256 dec, uint8 feeType) = _collectionConfig(collection);

        OriginFeeSplitter splitter = new OriginFeeSplitter(
            creator, platformTreasury, kasWallet, airdropVault,
            tokenAddress, router, feeHook, feeType
        );

        collectionToToken[collection] = tokenAddress;
        tokenToCollection[tokenAddress] = collection;
        tokenToSplitter[tokenAddress] = address(splitter);
        allTokens.push(tokenAddress);

        emit TokenDeployed(collection, tokenAddress, creator, name, symbol);

        if (msg.value > 0) {
            _createPool(tokenAddress, address(splitter), msg.value, feeBps, dec);
        }
        emit PoolCreated(tokenAddress, address(splitter), msg.value, token.TOTAL_SUPPLY() / 2);
    }

    function _createPool(address tokenAddr, address splitter, uint256 ethAmount, uint256 feeBps, uint256 decaySeconds) internal {
        uint256 tokenAmount = RecomToken(tokenAddr).TOTAL_SUPPLY() / 2;

        // currency0 = native ETH (0x0) is always < currency1 = token
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(tokenAddr),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(feeHook)
        });

        uint160 sqrtPriceX96 = _calcSqrtPriceX96(ethAmount, tokenAmount); // amount0=eth, amount1=token
        poolManager.initialize(key, sqrtPriceX96);
        IOriginFeeHook(feeHook).registerPool(key, splitter, feeBps, decaySeconds);

        poolManager.unlock(abi.encode(key, sqrtPriceX96, ethAmount, tokenAmount));
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "not pool manager");
        (PoolKey memory key, uint160 sqrtPriceX96, uint256 ethAmount, uint256 tokenAmount) =
            abi.decode(data, (PoolKey, uint160, uint256, uint256));

        int24 minTick = (TickMath.MIN_TICK / TICK_SPACING) * TICK_SPACING;
        int24 maxTick = (TickMath.MAX_TICK / TICK_SPACING) * TICK_SPACING;

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(minTick),
            TickMath.getSqrtPriceAtTick(maxTick),
            ethAmount,
            tokenAmount
        );

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: minTick,
                tickUpper: maxTick,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        // Pay the amounts owed for the position (negative deltas)
        if (delta.amount0() < 0) {
            key.currency0.settle(poolManager, address(this), uint256(uint128(-delta.amount0())), false);
        }
        if (delta.amount1() < 0) {
            key.currency1.settle(poolManager, address(this), uint256(uint128(-delta.amount1())), false);
        }
        // Position stays owned by this factory with no removal path => locked forever
        return "";
    }

    // ─── sqrt price helper ──────────────────────────────────────────────────────
    function _calcSqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        // sqrtPriceX96 = sqrt(amount1/amount0) * 2^96
        uint256 sqrtA0 = _sqrt(amount0);
        uint256 sqrtA1 = _sqrt(amount1);
        return uint160((sqrtA1 * (2 ** 96)) / sqrtA0);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x >> 1) + 1;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) >> 1;
        }
    }

    // ─── Admin / views ──────────────────────────────────────────────────────────
    function updateAddresses(address _treasury, address _vault, address _kas) external onlyOwner {
        platformTreasury = _treasury;
        airdropVault = _vault;
        kasWallet = _kas;
    }

    /// @notice Set the OriginSwapRouter used for creator fee buybacks (TOKEN/BOTH).
    function setRouter(address _router) external onlyOwner {
        router = _router;
    }

    /// @dev Read a collection's launch config (decay window, fee receive type) from
    ///      its launchpad. Fully defensive: any failure returns safe defaults
    ///      (decay 0 = off, feeType 0 = ETH) so bonding can never be bricked.
    function _collectionConfig(address collection) internal view returns (uint256 dec, uint8 feeType) {
        try IRecomNFTForDecay(collection).launchpad() returns (address lp) {
            if (lp != address(0)) {
                try IRecomLaunchpadForDecay(lp).collectionDecay(collection) returns (uint256 d) { dec = d; } catch {}
                try IRecomLaunchpadForDecay(lp).collectionFeeType(collection) returns (uint8 f) { feeType = f; } catch {}
            }
        } catch {}
    }

    function getAllTokens() external view returns (address[] memory) { return allTokens; }
    function getTokenCount() external view returns (uint256) { return allTokens.length; }
}
