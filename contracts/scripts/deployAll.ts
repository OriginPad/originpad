import { ethers, network } from "hardhat";
import * as fs from "fs";

const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408"; // Base Sepolia v4
const FLAGS = 0xccn;
const MASK = 0x3fffn;

async function waitCode(addr: string) {
  for (let i = 0; i < 40; i++) {
    const c = await ethers.provider.getCode(addr);
    if (c !== "0x") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("no code at " + addr);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const isTestnet = network.name === "base-sepolia";
  console.log("deployer:", deployer.address, "network:", network.name);

  const PLATFORM_TREASURY = deployer.address;
  const KAS_WALLET = deployer.address;
  const ORACLE_ADDRESS = deployer.address;

  // 1. CREATE2 factory + mine + deploy hook
  console.log("\n── Create2Factory + OriginFeeHook ──");
  const C2 = await ethers.getContractFactory("Create2Factory");
  const c2 = await C2.deploy();
  await c2.waitForDeployment();
  const c2Addr = await c2.getAddress();

  const Hook = await ethers.getContractFactory("OriginFeeHook");
  const initCode = ethers.concat([Hook.bytecode, Hook.interface.encodeDeploy([POOL_MANAGER, deployer.address])]);
  const initCodeHash = ethers.keccak256(initCode);
  let salt = 0n, hookAddr = "";
  for (;;) {
    const addr = ethers.getCreate2Address(c2Addr, ethers.toBeHex(salt, 32), initCodeHash);
    if ((BigInt(addr) & MASK) === FLAGS) { hookAddr = addr; break; }
    salt++;
  }
  await (await c2.deploy(ethers.toBeHex(salt, 32), initCode)).wait();
  await waitCode(hookAddr);
  console.log("OriginFeeHook:", hookAddr);

  // 2. Vault
  console.log("\n── RecomVault ──");
  const Vault = await ethers.getContractFactory("RecomVault");
  const vault = await Vault.deploy(PLATFORM_TREASURY, ORACLE_ADDRESS);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("RecomVault:", vaultAddr);

  // 3. Token factory (V4)
  console.log("\n── RecomTokenFactory (V4) ──");
  const Factory = await ethers.getContractFactory("RecomTokenFactory");
  const factory = await Factory.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, POOL_MANAGER, hookAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("RecomTokenFactory:", factoryAddr);

  // 4. wire hook -> factory
  const hook = await ethers.getContractAt("OriginFeeHook", hookAddr);
  await (await hook.setFactory(factoryAddr)).wait();
  console.log("hook.setFactory done");

  // 5. NFT deployer
  console.log("\n── RecomNFTDeployer ──");
  const NFTDep = await ethers.getContractFactory("RecomNFTDeployer");
  const nftDep = await NFTDep.deploy();
  await nftDep.waitForDeployment();
  const nftDepAddr = await nftDep.getAddress();
  console.log("RecomNFTDeployer:", nftDepAddr);

  // 6. Launchpad
  console.log("\n── RecomLaunchpad ──");
  const Launchpad = await ethers.getContractFactory("RecomLaunchpad");
  const launchpad = await Launchpad.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, factoryAddr, nftDepAddr);
  await launchpad.waitForDeployment();
  const launchpadAddr = await launchpad.getAddress();
  console.log("RecomLaunchpad:", launchpadAddr);

  const out = {
    network: network.name,
    chainId: isTestnet ? 84532 : 8453,
    poolManager: POOL_MANAGER,
    feeHook: hookAddr,
    create2Factory: c2Addr,
    salt: salt.toString(),
    vault: vaultAddr,
    tokenFactory: factoryAddr,
    nftDeployer: nftDepAddr,
    launchpad: launchpadAddr,
    deployer: deployer.address,
  };
  fs.writeFileSync("deployment.json", JSON.stringify(out, null, 2));
  console.log("\n=== DONE ===");
  console.log(JSON.stringify(out, null, 2));
  console.log("\n.env.local:");
  console.log(`NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${launchpadAddr}`);
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`NEXT_PUBLIC_FEE_HOOK_ADDRESS=${hookAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
