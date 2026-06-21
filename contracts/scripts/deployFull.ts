import { ethers, network } from "hardhat";
import * as fs from "fs";

// Full deploy: hook (mined) + vault + factory + NFT deployer + launchpad + airdrop
// distributor + swap router, wired together. Network-aware (Base Sepolia or Base
// mainnet). The 1% epoch airdrop routes into the AirdropDistributor (claim-based).
const POOL_MANAGERS: Record<string, string> = {
  "base-sepolia": "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  "base": "0x498581fF718922c3f8e6A244956aF099B2652b2b",
};
const FLAGS = 0xccn;
const MASK = 0x3fffn;

async function waitCode(addr: string) {
  for (let i = 0; i < 40; i++) {
    if ((await ethers.provider.getCode(addr)) !== "0x") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("no code at " + addr);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const POOL_MANAGER = POOL_MANAGERS[network.name];
  if (!POOL_MANAGER) throw new Error("no PoolManager for network " + network.name);
  const isTestnet = network.name === "base-sepolia";
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("deployer:", deployer.address, "network:", network.name, "balance:", ethers.formatEther(bal), "ETH");

  const PLATFORM_TREASURY = deployer.address;
  const KAS_WALLET = deployer.address;
  // Oracle is a separate fresh key (best practice: oracle != owner).
  const ORACLE_ADDRESS = process.env.MAINNET_ORACLE_ADDRESS || deployer.address;
  console.log("oracle role:", ORACLE_ADDRESS);

  // 1. Create2Factory + mine + deploy hook
  console.log("\n── Create2Factory + OriginFeeHook ──");
  const C2 = await ethers.getContractFactory("Create2Factory");
  const c2 = await C2.deploy(); await c2.waitForDeployment();
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
  console.log("OriginFeeHook:", hookAddr, "salt:", salt.toString());

  // 2. Vault
  const Vault = await ethers.getContractFactory("RecomVault");
  const vault = await Vault.deploy(PLATFORM_TREASURY, ORACLE_ADDRESS); await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress(); console.log("RecomVault:", vaultAddr);

  // 3. Token factory
  const Factory = await ethers.getContractFactory("RecomTokenFactory");
  const factory = await Factory.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, POOL_MANAGER, hookAddr); await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress(); console.log("RecomTokenFactory:", factoryAddr);

  // 4. wire hook -> factory
  const hook = await ethers.getContractAt("OriginFeeHook", hookAddr);
  await (await hook.setFactory(factoryAddr)).wait(); console.log("hook.setFactory done");

  // 5. NFT deployer
  const NFTDep = await ethers.getContractFactory("RecomNFTDeployer");
  const nftDep = await NFTDep.deploy(); await nftDep.waitForDeployment();
  const nftDepAddr = await nftDep.getAddress(); console.log("RecomNFTDeployer:", nftDepAddr);

  // 6. Launchpad
  const Launchpad = await ethers.getContractFactory("RecomLaunchpad");
  const launchpad = await Launchpad.deploy(PLATFORM_TREASURY, vaultAddr, KAS_WALLET, factoryAddr, nftDepAddr); await launchpad.waitForDeployment();
  const launchpadAddr = await launchpad.getAddress(); console.log("RecomLaunchpad:", launchpadAddr);

  // S5: lock the deployer to this launchpad so no one can mint orphan collections.
  await (await nftDep.setLaunchpad(launchpadAddr)).wait();
  console.log("RecomNFTDeployer.setLaunchpad ->", launchpadAddr);

  // 7. AirdropDistributor + wire
  const Dist = await ethers.getContractFactory("AirdropDistributor");
  const dist = await Dist.deploy(deployer.address, ORACLE_ADDRESS); await dist.waitForDeployment();
  const distAddr = await dist.getAddress(); console.log("AirdropDistributor:", distAddr);
  await (await dist.setVault(vaultAddr)).wait();
  await (await vault.setAirdropDistributor(distAddr)).wait();
  console.log("distributor <-> vault wired");

  // 8. Swap router
  const Router = await ethers.getContractFactory("OriginSwapRouter");
  const router = await Router.deploy(POOL_MANAGER); await router.waitForDeployment();
  const routerAddr = await router.getAddress(); console.log("OriginSwapRouter:", routerAddr);
  // Splitters use the router to buy back tokens for creators who pick TOKEN/BOTH fee.
  await (await factory.setRouter(routerAddr)).wait();
  console.log("factory.setRouter ->", routerAddr);

  // 9. Wiring assertion — the NFT 0.1% fee sink (launchpad.airdropVault) MUST be the
  // same vault the airdrop system drains (vault <-> distributor), or stream-2 fees
  // get stranded. Fail the deploy loudly rather than discover the split later.
  const lpVault = (await launchpad.airdropVault()) as string;
  const vaultDist = (await vault.airdropDistributor()) as string;
  const distVault = (await dist.vault()) as string;
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!eq(lpVault, vaultAddr) || !eq(vaultDist, distAddr) || !eq(distVault, vaultAddr)) {
    throw new Error(`WIRING SPLIT: launchpad.airdropVault=${lpVault} vault=${vaultAddr} vault.distributor=${vaultDist} dist=${distAddr} dist.vault=${distVault}`);
  }
  console.log("wiring verified: launchpad.airdropVault == vault <-> distributor");

  const out = {
    network: network.name, chainId: isTestnet ? 84532 : 8453,
    poolManager: POOL_MANAGER, feeHook: hookAddr, create2Factory: c2Addr, salt: salt.toString(),
    vault: vaultAddr, airdropDistributor: distAddr, tokenFactory: factoryAddr,
    nftDeployer: nftDepAddr, launchpad: launchpadAddr, swapRouter: routerAddr, deployer: deployer.address,
  };
  fs.writeFileSync(`deployment-${network.name}.json`, JSON.stringify(out, null, 2));
  console.log("\n=== DONE ===\n" + JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
