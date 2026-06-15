import { ethers } from "hardhat";
import * as fs from "fs";
const POOL_MANAGER = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408";
async function main() {
  const R = await ethers.getContractFactory("OriginSwapRouter");
  const r = await R.deploy(POOL_MANAGER);
  await r.waitForDeployment();
  const addr = await r.getAddress();
  console.log("OriginSwapRouter:", addr);
  const d = JSON.parse(fs.readFileSync("deployment.json","utf8"));
  d.swapRouter = addr;
  fs.writeFileSync("deployment.json", JSON.stringify(d,null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
