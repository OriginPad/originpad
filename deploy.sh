#!/bin/bash
# deploy.sh — jalanin dari VPS lu
# Usage: bash deploy.sh

set -e

echo "=== Recomendasi Deploy Script ==="
echo "Chain: Base Sepolia"

# ── 1. Clone / masuk ke folder contracts ─────────────────────────────────────
cd ~/recomendasi/contracts 2>/dev/null || {
  echo "Folder tidak ditemukan. Pastikan lu udah upload file contracts ke VPS."
  exit 1
}

# ── 2. Install deps ───────────────────────────────────────────────────────────
echo ""
echo ">> npm install..."
npm install

# ── 3. Set .env ───────────────────────────────────────────────────────────────
if [ -z "$PRIVATE_KEY" ]; then
  echo "ERROR: set your deployer key first -> export PRIVATE_KEY=0x..."
  exit 1
fi
cat > .env << ENVEOF
PRIVATE_KEY=$PRIVATE_KEY
BASESCAN_API_KEY=${BASESCAN_API_KEY:-}
ENVEOF

echo ">> .env written"

# ── 4. Compile ────────────────────────────────────────────────────────────────
echo ""
echo ">> Compiling contracts..."
npx hardhat compile

# ── 5. Deploy to Base Sepolia ─────────────────────────────────────────────────
echo ""
echo ">> Deploying to Base Sepolia..."
npx hardhat run scripts/deploy.ts --network base-sepolia 2>&1 | tee deploy-output.txt

# ── 6. Extract addresses ──────────────────────────────────────────────────────
echo ""
echo "=== DEPLOY OUTPUT ==="
cat deploy-output.txt

# ── 7. Auto-update frontend .env.local ───────────────────────────────────────
echo ""
echo ">> Updating frontend .env.local..."

LAUNCHPAD=$(grep "RecomLaunchpad:" deploy-output.txt | awk '{print $2}')
VAULT=$(grep "RecomVault:" deploy-output.txt | awk '{print $2}')
FACTORY=$(grep "RecomTokenFactory:" deploy-output.txt | awk '{print $2}')

if [ -n "$LAUNCHPAD" ]; then
  FRONTEND_ENV=~/recomendasi/frontend/.env.local
  sed -i "s|NEXT_PUBLIC_LAUNCHPAD_ADDRESS=.*|NEXT_PUBLIC_LAUNCHPAD_ADDRESS=$LAUNCHPAD|" $FRONTEND_ENV
  sed -i "s|NEXT_PUBLIC_VAULT_ADDRESS=.*|NEXT_PUBLIC_VAULT_ADDRESS=$VAULT|" $FRONTEND_ENV
  sed -i "s|NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=.*|NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=$FACTORY|" $FRONTEND_ENV
  echo ""
  echo "✅ frontend .env.local updated!"
  echo "   Launchpad : $LAUNCHPAD"
  echo "   Vault     : $VAULT"
  echo "   Factory   : $FACTORY"
else
  echo "⚠️  Gagal parse addresses — cek deploy-output.txt manual"
fi

echo ""
echo "=== DONE ==="
echo "Sekarang jalanin frontend:"
echo "  cd ~/recomendasi/frontend && npm install && npm run dev"
