import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { RecomLaunchpad, MockTokenFactory, RecomVault } from "../typechain-types";

describe("RecomLaunchpad", () => {
  let launchpad: RecomLaunchpad;
  let vault: RecomVault;
  let mockFactory: MockTokenFactory;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let creator: SignerWithAddress;
  let user: SignerWithAddress;

  const defaultPhotos: [string, string, string, string, string, string] = [
    "ipfs://photo1", "ipfs://photo2", "ipfs://photo3", "", "", ""
  ];
  const zeroRoot = ethers.ZeroHash;

  function makeParams(overrides: Partial<{
    name: string; ticker: string; photoCount: number; mintPriceWei: bigint;
  }> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
      name: overrides.name ?? "Test Creator",
      ticker: overrides.ticker ?? "TEST",
      bio: "A test bio",
      photoURIs: defaultPhotos,
      photoCount: overrides.photoCount ?? 3,
      socialX: "@test",
      socialGithub: "testgithub",
      socialFarcaster: "testfarc",
      mintPriceWei: overrides.mintPriceWei ?? 0n,
      tokenEnabled: false,
      tokenFeeBps: 0n,
      phaseRoots: [zeroRoot, zeroRoot, zeroRoot, zeroRoot] as [string, string, string, string],
      phaseStarts: [now, now, now, now] as [number, number, number, number],
      phaseEnds: [now + 86400, now + 86400, now + 86400, now + 86400] as [number, number, number, number],
      phaseMaxPerWallet: [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint],
      allowlistCID: "",
    };
  }

  beforeEach(async () => {
    [owner, treasury, creator, user] = await ethers.getSigners();

    vault = await ethers.deployContract("RecomVault", [treasury.address, owner.address]);
    mockFactory = await ethers.deployContract("MockTokenFactory", [
      treasury.address, await vault.getAddress(), treasury.address
    ]);
    launchpad = await ethers.deployContract("RecomLaunchpad", [
      treasury.address, await vault.getAddress(), await mockFactory.getAddress()
    ]);
  });

  describe("launchCollection", () => {
    it("deploys NFT and registers collection", async () => {
      const tx = await launchpad.connect(creator).launchCollection(makeParams());
      const receipt = await tx.wait();

      const collections = await launchpad.getAllCollections();
      expect(collections.length).to.equal(1);
      expect(await launchpad.isCollection(collections[0])).to.be.true;
    });

    it("emits CollectionLaunched event", async () => {
      const params = makeParams({ name: "MyCreator", ticker: "MYC" });
      await expect(launchpad.connect(creator).launchCollection(params))
        .to.emit(launchpad, "CollectionLaunched")
        .withArgs(
          (v: string) => v !== ethers.ZeroAddress,
          creator.address,
          "MyCreator",
          "MYC",
          0n,
          (v: bigint) => v > 0n
        );
    });

    it("registers collection under creator", async () => {
      await launchpad.connect(creator).launchCollection(makeParams());
      const creatorColls = await launchpad.getCreatorCollections(creator.address);
      expect(creatorColls.length).to.equal(1);
    });

    it("reverts with < 3 photos", async () => {
      await expect(
        launchpad.connect(creator).launchCollection(makeParams({ photoCount: 2 }))
      ).to.be.revertedWith("Need 3-6 photos");
    });

    it("reverts with > 6 photos", async () => {
      await expect(
        launchpad.connect(creator).launchCollection(makeParams({ photoCount: 7 }))
      ).to.be.revertedWith("Need 3-6 photos");
    });

    it("reverts with empty name", async () => {
      await expect(
        launchpad.connect(creator).launchCollection(makeParams({ name: "" }))
      ).to.be.revertedWith("Name required");
    });

    it("reverts with empty ticker", async () => {
      await expect(
        launchpad.connect(creator).launchCollection(makeParams({ ticker: "" }))
      ).to.be.revertedWith("Ticker required");
    });

    it("multiple creators each have own collections", async () => {
      await launchpad.connect(creator).launchCollection(makeParams({ name: "A", ticker: "AAA" }));
      await launchpad.connect(user).launchCollection(makeParams({ name: "B", ticker: "BBB" }));

      expect(await launchpad.getCreatorCollections(creator.address)).to.have.length(1);
      expect(await launchpad.getCreatorCollections(user.address)).to.have.length(1);
      expect(await launchpad.getAllCollections()).to.have.length(2);
      expect(await launchpad.getCollectionCount()).to.equal(2n);
    });
  });

  describe("getPlatformFeeETH", () => {
    it("returns 0.0003 ETH flat fee", async () => {
      expect(await launchpad.getPlatformFeeETH()).to.equal(ethers.parseEther("0.0003"));
    });
  });

  describe("updateAddresses", () => {
    it("owner can update platform addresses", async () => {
      await launchpad.connect(owner).updateAddresses(user.address, user.address, user.address);
      expect(await launchpad.platformTreasury()).to.equal(user.address);
    });

    it("non-owner cannot update", async () => {
      await expect(
        launchpad.connect(creator).updateAddresses(user.address, user.address, user.address)
      ).to.be.reverted;
    });
  });
});
