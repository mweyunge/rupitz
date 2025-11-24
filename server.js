// server.js
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const SETTINGS_FILE = path.join(__dirname, "settings.json");

// Default settings (created if missing)
function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const def = {
      admin_password: "traubz6000",
      usdt_tzs: 2600
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(def, null, 2));
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}
function saveSettings(data) {
  // preserve admin password if not provided
  const current = loadSettings();
  if (!data.admin_password) data.admin_password = current.admin_password;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Cache for Binance price
let lastCache = {
  priceIDR: null,
  updatedAt: 0,
};

// Fetch Binance USDT -> IDR price (best advertiser)
async function fetchBinanceUSDTPrice() {
  try {
    const r = await axios.post(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        page: 1,
        rows: 1,
        asset: "USDT",
        tradeType: "BUY",
        fiat: "IDR",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          Accept: "*/*",
        },
        timeout: 8000,
      }
    );

    const best = r.data && r.data.data && r.data.data[0];
    if (!best || !best.adv) return null;
    const price = parseFloat(best.adv.price);
    if (isNaN(price)) return null;

    lastCache.priceIDR = price;
    lastCache.updatedAt = Date.now();
    return price;
  } catch (e) {
    console.log("Binance fetch error:", e.message || e);
    return null;
  }
}

// formatting helper
function fmt(n) {
  return new Intl.NumberFormat().format(Number(n).toFixed(2));
}

/**
 * Profit model — piecewise linear interpolation using your 4 points:
 *  180 -> 30
 *  500000 -> 87000
 *  1000000 -> 98000
 *  3000000 -> 160000
 *
 * Values between these points are linearly interpolated.
 * Beyond 3M we grow slowly.
 */
function calculateProfit(amount) {
  const a1 = 180,   p1 = 30;
  const a2 = 500000, p2 = 87000;
  const a3 = 1000000, p3 = 98000;
  const a4 = 3000000, p4 = 160000;

  if (amount <= a1) return p1;
  if (amount <= a2) {
    return p1 + (p2 - p1) * ((amount - a1) / (a2 - a1));
  }
  if (amount <= a3) {
    return p2 + (p3 - p2) * ((amount - a2) / (a3 - a2));
  }
  if (amount <= a4) {
    return p3 + (p4 - p3) * ((amount - a3) / (a4 - a3));
  }
  // beyond a4: slow linear growth (20k per 1M extra)
  return p4 + ((amount - a4) / 1000000) * 20000;
}

/* --------------------------
   Conversion endpoint
   -------------------------- */
app.post("/api/convert", async (req, res) => {
  const { amount, direction } = req.body;

  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const settings = loadSettings();
  const usdt_tzs = Number(settings.usdt_tzs);
  if (!usdt_tzs || isNaN(usdt_tzs) || usdt_tzs <= 0) {
    return res.status(500).json({ error: "Admin USDT→TZS rate not set" });
  }

  // refresh binance price if stale
  if (!lastCache.updatedAt || (Date.now() - lastCache.updatedAt) > 30000) {
    await fetchBinanceUSDTPrice();
  }

  if (!lastCache.priceIDR) {
    return res.status(500).json({ error: "Failed to fetch market price" });
  }

  const binance_idr = lastCache.priceIDR;
  let USDT = 0, output = 0, profit = 0;

  // TZS -> IDR: convert TZS -> USDT -> IDR, profit based on IDR output
  if (direction === "TZS_TO_IDR") {
    USDT = amount / usdt_tzs;
    const idr_raw = USDT * binance_idr;
    profit = calculateProfit(idr_raw);
    output = idr_raw - profit;
    if (output < 0) output = 0;
  }
  // IDR -> TZS: convert IDR -> USDT -> TZS, profit based on IDR input
  else if (direction === "IDR_TO_TZS") {
    USDT = amount / binance_idr;
    const tzs_raw = USDT * usdt_tzs;
    profit = calculateProfit(amount); // amount is IDR input
    output = tzs_raw - profit;
    if (output < 0) output = 0;
  } else {
    return res.status(400).json({ error: "Invalid direction" });
  }

  res.json({
    converted: output,
    convertedFormatted: fmt(output),
    usdtUsed: Number(USDT.toFixed(8)),
    usdt_idr_price: binance_idr,
    usdt_tzs_rate: usdt_tzs,
    profitApplied: Number(profit.toFixed(2)),
    profitAppliedFormatted: fmt(profit),
    updatedAt: lastCache.updatedAt,
  });
});

/* --------------------------
   Admin endpoints
   -------------------------- */
app.post("/api/admin/save", (req, res) => {
  try {
    const body = req.body;
    const settings = loadSettings();

    // require password check
    if (!body.password || body.password !== settings.admin_password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // validate usdt_tzs
    const usdt_tzs = Number(body.usdt_tzs);
    if (!usdt_tzs || isNaN(usdt_tzs) || usdt_tzs <= 0) {
      return res.status(400).json({ error: "Invalid USDT->TZS rate" });
    }

    // Save only allowed fields
    const toSave = {
      admin_password: settings.admin_password, // keep same
      usdt_tzs: usdt_tzs
    };
    saveSettings(toSave);
    // clear cache
    lastCache = { priceIDR: null, updatedAt: 0 };
    res.json({ ok: true });
  } catch (e) {
    console.error("admin save error", e);
    res.status(500).json({ error: "Save failed" });
  }
});

// admin settings (admin UI expects /api/admin/settings)
app.get("/api/admin/settings", (req, res) => {
  const s = loadSettings();
  res.json({
    usdt_tzs: s.usdt_tzs,
    admin_password: "********", // never expose real password
    updatedAt: lastCache.updatedAt || null
  });
});

// market refresh for admin quick check
app.get("/api/market", async (req, res) => {
  await fetchBinanceUSDTPrice();
  if (!lastCache.priceIDR) return res.status(500).json({ error: "Failed to fetch market rate" });
  res.json({ marketRate: lastCache.priceIDR, updatedAt: lastCache.updatedAt });
});

/* --------------------------
   Static files are served from project root
   -------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Rupitz server running at http://localhost:${PORT}`);
});

