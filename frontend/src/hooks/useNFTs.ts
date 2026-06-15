// src/hooks/useNFTs.ts
import { usePublicClient } from "wagmi";
import { useState, useEffect } from "react";
import { NFT_ABI } from "@/lib/contracts";

export interface NFTItem {
  tokenId: number;
  owner: string;
  rarity: number;
  listPrice: bigint;
  imageURI: string;
}

export function useNFTsInCollection(collectionAddress: `0x${string}`) {
  const [nfts, setNFTs] = useState<NFTItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const client = usePublicClient();

  useEffect(() => {
    if (!client || !collectionAddress) return;

    const fetchNFTs = async () => {
      setIsLoading(true);
      try {
        const currentBlock = await client.getBlockNumber();
        const fromBlock = BigInt(Math.max(0, Number(currentBlock) - 45000));
        // Get mint events to find all token IDs and owners
        const mintLogs = await client.getLogs({
          address: collectionAddress,
          event: {
            type: "event",
            name: "NFTMinted",
            inputs: [
              { name: "minter", type: "address", indexed: true },
              { name: "tokenId", type: "uint256", indexed: false },
              { name: "rarity", type: "uint8", indexed: false },
              { name: "price", type: "uint256", indexed: false },
            ],
          },
          fromBlock,
        });

        const items: NFTItem[] = await Promise.all(
          mintLogs.map(async (log) => {
            const tokenId = Number(log.args.tokenId);

            // The NFTMinted event always carries a Common placeholder — real
            // rarity only exists post-sellout via getRarity().
            const [owner, listPrice, imageURI, rarityRaw] = await Promise.all([
              client.readContract({
                address: collectionAddress,
                abi: [
                  {
                    name: "tokenOwner",
                    type: "function",
                    stateMutability: "view",
                    inputs: [{ name: "", type: "uint256" }],
                    outputs: [{ type: "address" }],
                  },
                ],
                functionName: "tokenOwner",
                args: [BigInt(tokenId)],
              }).catch(() => "0x0" as string),

              client.readContract({
                address: collectionAddress,
                abi: [
                  {
                    name: "tokenListPrice",
                    type: "function",
                    stateMutability: "view",
                    inputs: [{ name: "", type: "uint256" }],
                    outputs: [{ type: "uint256" }],
                  },
                ],
                functionName: "tokenListPrice",
                args: [BigInt(tokenId)],
              }).catch(() => BigInt(0)),

              client.readContract({
                address: collectionAddress,
                abi: NFT_ABI,
                functionName: "uri",
                args: [BigInt(tokenId)],
              }).catch(() => ""),

              client.readContract({
                address: collectionAddress,
                abi: NFT_ABI,
                functionName: "getRarity",
                args: [BigInt(tokenId)],
              }).catch(() => 0),
            ]);

            return {
              tokenId,
              owner: owner as string,
              rarity: Number(rarityRaw),
              listPrice: listPrice as bigint,
              imageURI: imageURI as string,
            };
          })
        );

        setNFTs(items);
      } catch (err) {
        console.error("Failed to fetch NFTs:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNFTs();
  }, [client, collectionAddress]);

  return { nfts, isLoading };
}
