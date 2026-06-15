// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OriginFeeSplitter
 * @notice One per token. Receives the 1.5% swap fee in native ETH from the
 *         OriginFeeHook and splits it among creator, platform, kas and airdrop
 *         using the same ratio as before (of every 150 bps: creator 100,
 *         platform 20, kas 20, airdrop 10). distribute() is permissionless.
 */
contract OriginFeeSplitter is ReentrancyGuard {
    address public immutable creator;
    address public immutable platform;
    address public immutable kas;
    address public immutable airdrop;

    uint256 public constant CREATOR_BPS = 100; // 1.0%
    uint256 public constant PLATFORM_BPS = 20; // 0.2%
    uint256 public constant KAS_BPS = 20; // 0.2%
    uint256 public constant AIRDROP_BPS = 10; // 0.1%
    uint256 public constant TOTAL_BPS = 150; // 1.5%

    event Distributed(uint256 toCreator, uint256 toPlatform, uint256 toKas, uint256 toAirdrop);

    constructor(address _creator, address _platform, address _kas, address _airdrop) {
        require(_creator != address(0) && _platform != address(0) && _kas != address(0) && _airdrop != address(0), "zero addr");
        creator = _creator;
        platform = _platform;
        kas = _kas;
        airdrop = _airdrop;
    }

    receive() external payable {}

    /// @notice Split the accumulated ETH fees. Anyone can call.
    /// @dev nonReentrant + creator paid last so a contract-creator cannot reenter
    ///      to skew the split away from platform/kas/airdrop.
    function distribute() external nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "nothing to distribute");

        uint256 toCreator = (bal * CREATOR_BPS) / TOTAL_BPS;
        uint256 toPlatform = (bal * PLATFORM_BPS) / TOTAL_BPS;
        uint256 toAirdrop = (bal * AIRDROP_BPS) / TOTAL_BPS;
        uint256 toKas = bal - toCreator - toPlatform - toAirdrop;

        _send(platform, toPlatform);
        _send(airdrop, toAirdrop);
        _send(kas, toKas);
        _send(creator, toCreator);

        emit Distributed(toCreator, toPlatform, toKas, toAirdrop);
    }

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "send failed");
    }
}
