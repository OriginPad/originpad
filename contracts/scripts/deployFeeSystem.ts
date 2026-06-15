import { ethers } from "hardhat";
import * as fs from "fs";

const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408"; // Base Sepolia v4
const FLAGS = 0xccn; // beforeSwap + afterSwap + before/afterSwapReturnDelta
const MASK = 0x3fffn;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);

  // Deploy our own CREATE2 factory so we control the deploy + see real reverts
  const C2 = await ethers.getContractFactory("Create2Factory");
  const c2 = await C2.deploy();
  await c2.waitForDeployment();
  const c2Addr = await c2.getAddress();
  console.log("create2 factory:", c2Addr);

  // Build hook init code (creation bytecode + constructor args)
  const Hook = await ethers.getContractFactory("OriginFeeHook");
  const initCode = ethers.concat([
    Hook.bytecode,
    Hook.interface.encodeDeploy([POOL_MANAGER, deployer.address]),
  ]);
  const initCodeHash = ethers.keccak256(initCode);

  // Mine a salt so the hook address encodes the right permission flags
  console.log("mining hook salt...");
  let salt = 0n;
  let hookAddr = "";
  for (;;) {
    const saltHex = ethers.toBeHex(salt, 32);
    const addr = ethers.getCreate2Address(c2Addr, saltHex, initCodeHash);
    if ((BigInt(addr) & MASK) === FLAGS) {
      hookAddr = addr;
      break;
    }
    salt++;
    if (salt % 50000n === 0n) console.log("  tried", salt.toString());
  }
  console.log("mined salt:", salt.toString(), "=> hook:", hookAddr);

  // Deploy hook via our CREATE2 factory (reverts with reason on failure)
  const tx = await c2.deploy(ethers.toBeHex(salt, 32), initCode);
  const rcpt = await tx.wait();
  console.log("deploy tx mined, status:", rcpt?.status);

  // Poll for code (Base Sepolia public RPC lags on reads after writes)
  let code = "0x";
  for (let i = 0; i < 30; i++) {
    code = await ethers.provider.getCode(hookAddr);
    if (code !== "0x") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (code === "0x") throw new Error("hook deploy failed (no code after polling)");
  console.log("hook deployed, code bytes:", (code.length - 2) / 2);

  // Deploy factory (fee wallets = deployer for now, poolManager + hook wired in)
  const Factory = await ethers.getContractFactory("RecomTokenFactory");
  const factory = await Factory.deploy(
    deployer.address, deployer.address, deployer.address,
    POOL_MANAGER, hookAddr
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("factory:", factoryAddr);

  // Point the hook at the factory
  const hook = await ethers.getContractAt("OriginFeeHook", hookAddr);
  await (await hook.setFactory(factoryAddr)).wait();
  console.log("hook.setFactory done");

  const out = { poolManager: POOL_MANAGER, hook: hookAddr, factory: factoryAddr, salt: salt.toString(), deployer: deployer.address };
  fs.writeFileSync("fee-system.json", JSON.stringify(out, null, 2));
  console.log("\nsaved fee-system.json:", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
