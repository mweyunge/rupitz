// script.js
let lastConversion = null;
const WHATSAPP_NUMBER = "6281235158460"; // your number

const convertBtn = document.getElementById("convertBtn");
const confirmBtn = document.getElementById("confirmBtn");
const resultDiv = document.getElementById("result");

convertBtn.addEventListener("click", convert);
confirmBtn.addEventListener("click", sendWhatsapp);

async function convert() {
  resultDiv.textContent = "";
  confirmBtn.style.display = "none";

  const amount = Number(document.getElementById("amount").value);
  const direction = document.getElementById("direction").value;

  if (!amount || amount <= 0) {
    resultDiv.textContent = "Enter a valid amount.";
    return;
  }

  resultDiv.textContent = "Calculating...";

  try {
    const r = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, direction })
    });
    const data = await r.json();
    if (data.error) {
      resultDiv.textContent = data.error;
      return;
    }

    lastConversion = {
      amount,
      direction,
      convertedFormatted: data.convertedFormatted,
      convertedRaw: data.converted,
    };

    const from = direction === "TZS_TO_IDR" ? "TZS" : "IDR";
    const to = direction === "TZS_TO_IDR" ? "IDR" : "TZS";

    resultDiv.innerHTML = `
      <strong>Do you want to exchange?</strong><br/><br/>
      From: ${from} ${Number(amount).toLocaleString()}<br/>
      To: ${to} ${data.convertedFormatted}<br/>
    `;

    confirmBtn.style.display = "block";
  } catch (e) {
    resultDiv.textContent = "Network or server error.";
  }
}

function sendWhatsapp() {
  if (!lastConversion) return;

  const { amount, direction, convertedFormatted } = lastConversion;
  const from = direction === "TZS_TO_IDR" ? "TZS" : "IDR";
  const to = direction === "TZS_TO_IDR" ? "IDR" : "TZS";

  const message =
`Hello Egi,
I want to exchange:

From: ${from} ${Number(amount).toLocaleString()}
To: ${to} ${convertedFormatted}

Please confirm.`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

