// admin.js
const adminPasswordInput = document.getElementById('adminPassword');
const usdtTzsInput = document.getElementById('usdtTzs');
const saveBtn = document.getElementById('saveBtn');
const adminMsg = document.getElementById('adminMsg');
const curUsdtTzs = document.getElementById('curUsdtTzs');
const curUpdated = document.getElementById('curUpdated');
const refreshMarketBtn = document.getElementById('refreshMarket');
const marketMsg = document.getElementById('marketMsg');

async function loadSettings() {
  try {
    const r = await fetch('/api/admin/settings');
    if (!r.ok) return;
    const d = await r.json();
    curUsdtTzs.textContent = d.usdt_tzs ?? '-';
    usdtTzsInput.value = d.usdt_tzs ?? '';
    curUpdated.textContent = d.updatedAt ? new Date(d.updatedAt).toLocaleString() : '-';
  } catch (e) {
    // ignore
  }
}

saveBtn.addEventListener('click', async () => {
  adminMsg.textContent = '';
  adminMsg.style.color = '#ffdddd';
  const password = adminPasswordInput.value;
  const usdt_tzs = parseFloat(usdtTzsInput.value);

  if (!password) { adminMsg.textContent = 'Enter password.'; return; }
  if (!usdt_tzs || isNaN(usdt_tzs) || usdt_tzs <= 0) { adminMsg.textContent = 'Enter valid USDT->TZS rate.'; return; }

  try {
    const r = await fetch('/api/admin/save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password, usdt_tzs })
    });
    const d = await r.json();
    if (!r.ok) {
      adminMsg.textContent = d.error || 'Save failed';
      return;
    }
    adminMsg.style.color = '#8fe36b';
    adminMsg.textContent = 'Settings saved.';
    adminPasswordInput.value = '';
    loadSettings();
  } catch (e) {
    adminMsg.textContent = 'Save failed';
  }
});

refreshMarketBtn.addEventListener('click', async () => {
  marketMsg.textContent = 'Refreshing...';
  try {
    const r = await fetch('/api/market');
    if (!r.ok) { marketMsg.textContent = 'Failed'; return; }
    const d = await r.json();
    marketMsg.textContent = `USDT → IDR: ${Number(d.marketRate).toLocaleString()} (updated ${new Date(d.updatedAt).toLocaleString()})`;
    loadSettings();
  } catch (e) {
    marketMsg.textContent = 'Failed';
  }
});

loadSettings();

