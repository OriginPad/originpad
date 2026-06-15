import { ethers, network } from "hardhat";

/**
 * Deploy order:
 * 1. RecomVault
 * 2. RecomTokenFactory (needs vault address)
 * 3. RecomLaunchpad (needs factory + vault)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Network:", network.name);

  const isTestnet = network.name === "base-sepolia";

  // ── Platform addresses (update before mainnet) ────────────────────────────────
  const PLATFORM_TREASURY = deployer.address; // TODO: replace with multisig
  const KAS_WALLET = deployer.address;        // TODO: replace with ops wallet
  const ORACLE_ADDRESS = deployer.address;    // TODO: replace with backend wallet

  console.log("\n── Step 1: Deploy RecomVault ──");
  const VaultFactory = await ethers.getContractFactory("RecomVault");
  const vault = await VaultFactory.deploy(PLATFORM_TREASURY, ORACLE_ADDRESS);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("RecomVault:", vaultAddress);

  console.log("\n── Step 2: Deploy RecomTokenFactory ──");
  const TokenFactoryFactory = await ethers.getContractFactory("RecomTokenFactory");
  const tokenFactory = await TokenFactoryFactory.deploy(
    PLATFORM_TREASURY,
    vaultAddress,
    KAS_WALLET
  );
  await tokenFactory.waitForDeployment();
  const tokenFactoryAddress = await tokenFactory.getAddress();
  console.log("RecomTokenFactory:", tokenFactoryAddress);

  console.log("\n── Step 3: Deploy RecomNFTDeployer ──");
  const NFTDeployerFactory = await ethers.getContractFactory("RecomNFTDeployer");
  const nftDeployer = await NFTDeployerFactory.deploy();
  await nftDeployer.waitForDeployment();
  const nftDeployerAddress = await nftDeployer.getAddress();
  console.log("RecomNFTDeployer:", nftDeployerAddress);

  console.log("\n── Step 4: Deploy RecomLaunchpad ──");
  const LaunchpadFactory = await ethers.getContractFactory("RecomLaunchpad");
  const launchpad = await LaunchpadFactory.deploy(
    PLATFORM_TREASURY,
    vaultAddress,
    tokenFactoryAddress,
    nftDeployerAddress
  );
  await launchpad.waitForDeployment();
  const launchpadAddress = await launchpad.getAddress();
  console.log("RecomLaunchpad:", launchpadAddress);

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("✅ Deployment Complete");
  console.log("═══════════════════════════════════════════════════");
  console.log("Network:          ", network.name);
  console.log("RecomVault:       ", vaultAddress);
  console.log("RecomTokenFactory:", tokenFactoryAddress);
  console.log("RecomNFTDeployer: ", nftDeployerAddress);
  console.log("RecomLaunchpad:   ", launchpadAddress);
  console.log("Platform fee:      0.0003 ETH flat (no oracle)");
  console.log("═══════════════════════════════════════════════════");

  console.log("\n📋 Add to your .env.local (Next.js):");
  console.log(`NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${launchpadAddress}`);
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${tokenFactoryAddress}`);
  console.log(`NEXT_PUBLIC_CHAIN_ID=${isTestnet ? 84532 : 8453}`);

  console.log("\n🔍 Verify contracts:");
  console.log(`npx hardhat verify --network ${network.name} ${vaultAddress} "${PLATFORM_TREASURY}" "${ORACLE_ADDRESS}"`);
  console.log(`npx hardhat verify --network ${network.name} ${tokenFactoryAddress} "${PLATFORM_TREASURY}" "${vaultAddress}" "${KAS_WALLET}"`);
  console.log(`npx hardhat verify --network ${network.name} ${nftDeployerAddress}`);
  console.log(`npx hardhat verify --network ${network.name} ${launchpadAddress} "${PLATFORM_TREASURY}" "${vaultAddress}" "${tokenFactoryAddress}" "${nftDeployerAddress}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
