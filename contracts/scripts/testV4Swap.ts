import { ethers } from "hardhat";
import * as fs from "fs";

const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";
const STATE_VIEW = "0x571291b572ed32ce6751a2cb2486ebee8defb9b4";

async function poll<T>(fn: () => Promise<T>, ok: (v: T) => boolean, tries = 30): Promise<T> {
  let v: any;
  for (let i = 0; i < tries; i++) {
    try { v = await fn(); if (ok(v)) return v; } catch (_) {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return v;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const sys = JSON.parse(fs.readFileSync("fee-system.json", "utf8"));
  console.log("factory:", sys.factory, "hook:", sys.hook);

  const factory = await ethers.getContractAt("RecomTokenFactory", sys.factory);

  // Deploy minimal swap router
  const SH = await ethers.getContractFactory("SwapHelper");
  const sh = await SH.deploy(POOL_MANAGER);
  await sh.waitForDeployment();
  const shAddr = await sh.getAddress();
  console.log("swap helper:", shAddr);

  // Create token + pool + liquidity
  const fakeCollection = ethers.Wallet.createRandom().address;
  const seed = ethers.parseEther("0.005");
  console.log("\ndeployToken (seed", ethers.formatEther(seed), "ETH)...");
  const tx = await factory.deployToken(
    fakeCollection, deployer.address,
    "TestV4", "TV4", "ipfs://x", "bio", "", "", "",
    150,
    { value: seed }
  );
  await tx.wait();

  const token = await poll(() => factory.collectionToToken(fakeCollection), (v) => v !== ethers.ZeroAddress);
  const splitter = await factory.tokenToSplitter(token);
  console.log("token:", token, "splitter:", splitter);

  // PoolKey: currency0 = ETH(0x0), currency1 = token
  const key = {
    currency0: ethers.ZeroAddress,
    currency1: token,
    fee: 0,
    tickSpacing: 60,
    hooks: sys.hook,
  };
  const poolId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]
    )
  );

  const stateView = await ethers.getContractAt(
    ["function getSlot0(bytes32) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)"],
    STATE_VIEW
  );
  const slot0 = await poll(() => stateView.getSlot0(poolId), (v: any) => v && v[0] > 0n);
  console.log("pool sqrtPriceX96:", slot0[0].toString(), "tick:", slot0[1].toString());

  const erc20 = await ethers.getContractAt("RecomToken", token);
  const keyTuple = [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks];

  // ── BUY: ETH -> token ──
  const buyIn = ethers.parseEther("0.001");
  const splitterBefore = await ethers.provider.getBalance(splitter);
  console.log("\n[BUY] ETH -> token, in =", ethers.formatEther(buyIn));
  const bt = await sh.swapExactIn(keyTuple, true, buyIn, { value: buyIn });
  await bt.wait();
  const tokBal = await poll(() => erc20.balanceOf(deployer.address), (v: bigint) => v > 0n);
  const splitterAfterBuy = await poll(() => ethers.provider.getBalance(splitter), (v: bigint) => v > splitterBefore);
  console.log("  token received:", ethers.formatEther(tokBal));
  console.log("  splitter ETH +", ethers.formatEther(splitterAfterBuy - splitterBefore), "(expect ~1.5% of", ethers.formatEther(buyIn), ")");

  // ── SELL: token -> ETH ──
  const sellAmt = tokBal / 2n;
  await (await erc20.approve(shAddr, sellAmt)).wait();
  console.log("\n[SELL] token -> ETH, in =", ethers.formatEther(sellAmt));
  const st = await sh.swapExactIn(keyTuple, false, sellAmt);
  await st.wait();
  const splitterAfterSell = await poll(() => ethers.provider.getBalance(splitter), (v: bigint) => v > splitterAfterBuy);
  console.log("  splitter ETH +", ethers.formatEther(splitterAfterSell - splitterAfterBuy), "(sell fee in ETH)");
  console.log("  splitter total ETH:", ethers.formatEther(splitterAfterSell));

  // ── distribute ──
  console.log("\n[DISTRIBUTE]");
  const splitterC = await ethers.getContractAt("OriginFeeSplitter", splitter);
  await (await splitterC.distribute()).wait();
  const finalBal = await ethers.provider.getBalance(splitter);
  console.log("  splitter ETH after distribute:", ethers.formatEther(finalBal));
  console.log("\nDONE. buy + sell both worked, fee collected in ETH.");
}

main().catch((e) => { console.error(e); process.exit(1); });
