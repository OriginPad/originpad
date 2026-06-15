"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useBalance, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import toast from "react-hot-toast";
import { CONTRACTS, SWAP_ROUTER_ABI, STATE_VIEW_ABI, ERC20_ABI, FEE_HOOK_ABI, poolKeyFor, poolIdFor } from "@/lib/contracts";

const SLIPPAGE_OPTIONS = [1, 3, 5, 10];

export function SwapBox({ token, symbol }: { token: `0x${string}`; symbol: string }) {
  const { address } = useAccount();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);

  const key = useMemo(() => poolKeyFor(token), [token]);
  const poolId = useMemo(() => poolIdFor(token), [token]);

  const { data: ethBal } = useBalance({ address });
  const { data: tokenBalRaw } = useReadContract({
    address: token, abi: ERC20_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: slot0 } = useReadContract({
    address: CONTRACTS.stateView, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [poolId],
    query: { refetchInterval: 15000 },
  });
  const { data: feeBpsRaw } = useReadContract({
    address: CONTRACTS.feeHook, abi: FEE_HOOK_ABI, functionName: "poolFeeBps", args: [poolId],
  });
  const { data: allowance } = useReadContract({
    address: token, abi: ERC20_ABI, functionName: "allowance",
    args: address ? [address, CONTRACTS.swapRouter] : undefined, query: { enabled: !!address && side === "sell" },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  // price = token per ETH, from sqrtPriceX96 (both 18 decimals)
  const price = useMemo(() => {
    const sp = (slot0 as any)?.[0] as bigint | undefined;
    if (!sp || sp === 0n) return 0;
    const r = Number(sp) / 2 ** 96;
    return r * r;
  }, [slot0]);

  const tokenBal = tokenBalRaw ? Number(formatEther(tokenBalRaw as bigint)) : 0;
  const amtNum = parseFloat(amount) || 0;

  // hook fee in bps (default 1.5% until loaded)
  const feeBps = feeBpsRaw && (feeBpsRaw as bigint) > 0n ? Number(feeBpsRaw as bigint) : 150;
  const feePct = feeBps / 100;
  const keepRatio = 1 - feeBps / 10000;

  // Spot estimate (ignores price impact) used as a fallback before/if the live
  // simulation is unavailable.
  const spotOut = useMemo(() => {
    if (!price || !amtNum) return 0;
    return side === "buy" ? amtNum * price * keepRatio : (amtNum / price) * keepRatio;
  }, [price, amtNum, side, keepRatio]);

  // Live simulated output (accounts for price impact + hook fee). Null until a
  // quote resolves or if the simulation fails (e.g. sell before approval).
  const [liveOut, setLiveOut] = useState<bigint | null>(null);

  // Raw simulated output of swapExactIn with no min, the real amount out.
  async function quoteRaw(zeroForOne: boolean, amountIn: bigint, value: bigint): Promise<bigint | null> {
    if (!publicClient || !address) return null;
    try {
      const { result } = await publicClient.simulateContract({
        address: CONTRACTS.swapRouter, abi: SWAP_ROUTER_ABI, functionName: "swapExactIn",
        args: [key, zeroForOne, amountIn, 0n, address], value, account: address,
      });
      return result as bigint;
    } catch {
      return null; // simulation unavailable; caller falls back
    }
  }

  // Apply slippage to a raw output to get the on-chain minOut.
  function applySlippage(out: bigint): bigint {
    return (out * BigInt(10000 - Math.round(slippage * 100))) / 10000n;
  }

  async function quoteMinOut(zeroForOne: boolean, amountIn: bigint, value: bigint): Promise<bigint> {
    const out = await quoteRaw(zeroForOne, amountIn, value);
    return out === null ? 0n : applySlippage(out);
  }

  // Keep the displayed estimate in sync with a live simulation (debounced).
  useEffect(() => {
    if (!amtNum || !price || !publicClient || !address) { setLiveOut(null); return; }
    let active = true;
    const t = setTimeout(async () => {
      let amountIn: bigint;
      try { amountIn = parseEther(amount); } catch { if (active) setLiveOut(null); return; }
      const out = await quoteRaw(side === "buy", amountIn, side === "buy" ? amountIn : 0n);
      if (active) setLiveOut(out);
    }, 350);
    return () => { active = false; clearTimeout(t); };
  }, [amount, side, price, address, publicClient]);

  // Prefer the live simulation; fall back to the spot estimate.
  const estOut = liveOut !== null ? Number(formatEther(liveOut)) : spotOut;
  const minOut = estOut * (1 - slippage / 100);

  async function handleSwap() {
    if (!address) return toast.error("Connect wallet");
    if (!amtNum) return toast.error("Enter an amount");
    if (!price) return toast.error("Pool not ready");

    try {
      if (side === "buy") {
        const amountIn = parseEther(amount);
        if (ethBal && amountIn > ethBal.value) return toast.error("Not enough ETH");
        const minOutWei = await quoteMinOut(true, amountIn, amountIn);
        await writeContractAsync({
          address: CONTRACTS.swapRouter, abi: SWAP_ROUTER_ABI, functionName: "swapExactIn",
          args: [key, true, amountIn, minOutWei, address], value: amountIn,
        });
        toast.success(`Bought ${symbol}`);
      } else {
        const amountIn = parseEther(amount);
        if (tokenBalRaw && amountIn > (tokenBalRaw as bigint)) return toast.error(`Not enough ${symbol}`);
        // approve if needed — wait for the approval to mine before swapping,
        // otherwise the swap tx races ahead of a stale allowance and reverts.
        if (!allowance || (allowance as bigint) < amountIn) {
          toast.loading("Approving...", { id: "appr" });
          const approveHash = await writeContractAsync({
            address: token, abi: ERC20_ABI, functionName: "approve",
            args: [CONTRACTS.swapRouter, amountIn],
          });
          if (publicClient) await publicClient.waitForTransactionReceipt({ hash: approveHash });
          toast.dismiss("appr");
        }
        const minOutWei = await quoteMinOut(false, amountIn, 0n);
        await writeContractAsync({
          address: CONTRACTS.swapRouter, abi: SWAP_ROUTER_ABI, functionName: "swapExactIn",
          args: [key, false, amountIn, minOutWei, address],
        });
        toast.success(`Sold ${symbol}`);
      }
      setAmount("");
    } catch (e: any) {
      toast.dismiss("appr");
      toast.error(e?.shortMessage || e?.message?.slice(0, 80) || "Swap failed");
    }
  }

  const inLabel = side === "buy" ? "ETH" : symbol;
  const outLabel = side === "buy" ? symbol : "ETH";
  const inBal = side === "buy" ? (ethBal ? Number(formatEther(ethBal.value)) : 0) : tokenBal;

  return (
    <div className="card rounded-2xl border border-border p-4">
      {/* Buy/Sell toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-bg-secondary rounded-xl mb-4">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setAmount(""); }}
            className={`py-2 text-sm font-semibold rounded-lg transition-colors ${
              side === s
                ? "bg-amber text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-secondary">You pay ({inLabel})</span>
          <button
            onClick={() => setAmount(inBal > 0 ? (side === "buy" ? Math.max(inBal - 0.0005, 0) : inBal).toString() : "")}
            className="text-xs text-amber hover:underline font-mono"
          >
            balance: {inBal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </button>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="w-full px-3 py-2.5 text-lg font-mono bg-bg-secondary rounded-xl border border-border focus:border-amber outline-none"
        />
      </div>

      {/* Output estimate */}
      <div className="mb-3 px-1">
        <span className="text-xs text-text-secondary">
          You receive (est): <span className="font-mono text-text-primary">
            {estOut.toLocaleString(undefined, { maximumFractionDigits: outLabel === "ETH" ? 6 : 2 })} {outLabel}
          </span>
        </span>
      </div>

      {/* Slippage */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-text-secondary">Slippage</span>
        {SLIPPAGE_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSlippage(s)}
            className={`px-2 py-0.5 text-xs rounded-md font-mono ${
              slippage === s ? "bg-amber text-white" : "bg-bg-secondary text-text-secondary"
            }`}
          >
            {s}%
          </button>
        ))}
      </div>

      <button
        onClick={handleSwap}
        disabled={isPending || !amtNum}
        className="btn-primary btn-block"
      >
        {isPending ? "Confirming..." : !address ? "Connect Wallet" : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
      </button>

      <p className="text-[10px] text-text-secondary text-center mt-2">
        {feePct.toFixed(1)}% fee in ETH per trade. Liquidity locked. Powered by Uniswap V4.
      </p>
    </div>
  );
}
