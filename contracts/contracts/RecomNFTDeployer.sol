// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RecomNFT.sol";

/**
 * @title RecomNFTDeployer
 * @notice Holds the RecomNFT creation bytecode so RecomLaunchpad stays under
 *         the EIP-170 24KB runtime size limit. The caller (launchpad) is
 *         recorded as the NFT's launchpad address.
 */
contract RecomNFTDeployer {
    function deployNFT(
        address _creator,
        string calldata _name,
        string calldata _ticker,
        string calldata _bio,
        string[6] calldata _photoURIs,
        uint8 _photoCount,
        string calldata _socialX,
        string calldata _socialGithub,
        string calldata _socialFarcaster,
        uint256 _mintPriceWei,
        uint256 _platformFeeWei,
        bool _tokenEnabled,
        uint256 _tokenFeeBps,
        address _platformTreasury,
        address _airdropVault,
        address _kasWallet,
        address _tokenFactory
    ) external returns (address) {
        RecomNFT nft = new RecomNFT(
            _creator,
            _name,
            _ticker,
            _bio,
            _photoURIs,
            _photoCount,
            _socialX,
            _socialGithub,
            _socialFarcaster,
            _mintPriceWei,
            _platformFeeWei,
            _tokenEnabled,
            _tokenFeeBps,
            _platformTreasury,
            _airdropVault,
            _kasWallet,
            _tokenFactory,
            msg.sender
        );
        return address(nft);
    }
}
