"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import toast from "react-hot-toast";

const API = process.env.NEXT_PUBLIC_PROFILE_API || "https://originpad.live";

export default function FeedbackPage() {
  const { address } = useAccount();
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const msg = message.trim();
    if (msg.length < 3) { toast.error("Please write a bit more"); return; }
    setSending(true);
    try {
      const r = await fetch(`${API}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, contact: contact.trim(), wallet: address || "" }),
      });
      if (!r.ok) throw new Error();
      setSent(true);
      setMessage("");
      setContact("");
      toast.success("Thanks for the feedback!");
    } catch {
      toast.error("Could not send, try again");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <p className="text-xs font-semibold text-amber uppercase tracking-wide mb-1">Public Testnet</p>
      <h1 className="text-3xl font-bold text-text-primary mb-2" style={{ fontFamily: "var(--font-display)" }}>
        Feedback & bug reports
      </h1>
      <p className="text-sm text-text-secondary mb-8 leading-relaxed">
        OriginPad is live on Base Sepolia for testing. Found a bug, something
        confusing, or have an idea? Tell us. Every report helps us harden the
        platform before mainnet.
      </p>

      {sent ? (
        <div className="card text-center py-12">
          <p className="text-lg font-semibold text-text-primary mb-2">Got it, thank you</p>
          <p className="text-sm text-text-secondary mb-6">Your feedback was recorded.</p>
          <button onClick={() => setSent(false)} className="btn-outline btn-sm">Send another</button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-dim uppercase tracking-wide block mb-1.5">
              Your feedback
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="What happened, what page, what did you expect..."
              className="input-base resize-y"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-dim uppercase tracking-wide block mb-1.5">
              Contact (optional)
            </label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              maxLength={120}
              placeholder="X handle, Telegram, or email"
              className="input-base"
            />
            {address && (
              <p className="text-[11px] text-text-dim mt-1.5">
                Connected wallet {address.slice(0, 6)}…{address.slice(-4)} will be attached.
              </p>
            )}
          </div>
          <button onClick={submit} disabled={sending} className="btn-primary btn-block">
            {sending ? "Sending..." : "Send feedback"}
          </button>
        </div>
      )}
    </div>
  );
}
