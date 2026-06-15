// PM2 config for the OriginPad frontend.
// Cluster mode runs one Next worker per CPU core (8 here) sharing port 3000,
// so traffic is spread across all cores instead of saturating a single one.
module.exports = {
  apps: [
    {
      name: "recomendasi",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/root/recomendasi/recomendasi/frontend",
      instances: 8,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
    },
  ],
};
