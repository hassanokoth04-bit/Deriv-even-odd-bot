const APP_ID = "34eUE5W4X4BBYRnAAoXWs";

let ws = null;
let digits = [];
let connected = false;

const $ = (id) => document.getElementById(id);

function setStatus(text, online = false) {
  $("status").textContent = text;
  $("status").className = "status " + (online ? "online" : "offline");
}

function lastDigit(quote) {
  const text = String(quote);
  const numbers = text.replace(/\D/g, "");
  return numbers ? Number(numbers.slice(-1)) : null;
}

function renderDigits() {
  if (!digits.length) {
    $("digits").innerHTML = "<span>Waiting for market data…</span>";
    return;
  }

  $("digits").innerHTML = digits
    .slice(-50)
    .reverse()
    .map(
      (d) =>
        `<span class="${d % 2 === 0 ? "even" : "odd"}">${d}</span>`
    )
    .join("");
}

function evenPct(count) {
  const sample = digits.slice(-count);

  if (!sample.length) return "—";

  const even = sample.filter((d) => d % 2 === 0).length;

  return Math.round((even / sample.length) * 100) + "%";
}

function updateAnalysis() {
  $("even10").textContent = evenPct(10);
  $("even20").textContent = evenPct(20);
  $("even50").textContent = evenPct(50);

  if (digits.length < 20) {
    $("signal").textContent = "WAIT";
    $("signalReason").textContent =
      `Collecting data: ${digits.length}/20 digits`;
    return;
  }

  const p10 = parseInt(evenPct(10)) || 0;
  const p20 = parseInt(evenPct(20)) || 0;
  const p50 = parseInt(evenPct(50)) || 0;

  const score = (p10 + p20 + p50) / 3;

  if (score >= 60) {
    $("signal").textContent = "EVEN BIAS";
    $("signalReason").textContent =
      `Even frequency is ${score.toFixed(0)}% across the 10/20/50 samples.`;
  } else if (score <= 40) {
    $("signal").textContent = "ODD BIAS";
    $("signalReason").textContent =
      `Odd frequency is ${(100 - score).toFixed(0)}% across the samples.`;
  } else {
    $("signal").textContent = "WAIT";
    $("signalReason").textContent =
      "No strong imbalance. Avoid forcing a trade.";
  }
}

function addQuote(quote) {
  $("quote").textContent = quote;

  const digit = lastDigit(quote);

  if (digit === null) return;

  $("digit").textContent = digit;

  digits.push(digit);

  if (digits.length > 200) {
    digits.shift();
  }

  renderDigits();
  updateAnalysis();
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function connect() {
  const token = $("token").value.trim();

  if (!token) {
    alert("Paste your Deriv API token first.");
    return;
  }

  if (ws) {
    ws.close();
  }

  setStatus("Connecting…");

  ws = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(
      APP_ID
    )}`
  );

  ws.onopen = () => {
    connected = true;

    setStatus("Connected", true);

    $("connectBtn").disabled = true;
    $("disconnectBtn").disabled = false;

    send({
      authorize: token
    });
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.error) {
      console.error(data.error);

      setStatus("API error");

      if (data.msg_type === "authorize") {
        alert(data.error.message);
      }

      return;
    }

    if (data.msg_type === "authorize") {
      send({
        ticks: $("symbol").value,
        subscribe: 1
      });
    }

    if (data.msg_type === "tick") {
      addQuote(data.tick.quote);
    }
  };

  ws.onerror = () => {
    setStatus("Connection error");
  };

  ws.onclose = () => {
    connected = false;

    setStatus("Disconnected");

    $("connectBtn").disabled = false;
    $("disconnectBtn").disabled = true;
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }

  connected = false;

  setStatus("Disconnected");

  $("connectBtn").disabled = false;
  $("disconnectBtn").disabled = true;
}

$("connectBtn").addEventListener("click", connect);

$("disconnectBtn").addEventListener("click", disconnect);

$("clearBtn").addEventListener("click", () => {
  digits = [];

  $("quote").textContent = "—";
  $("digit").textContent = "—";

  renderDigits();
  updateAnalysis();
});

$("symbol").addEventListener("change", () => {
  if (connected) {
    digits = [];

    send({
      forget_all: "ticks"
    });

    send({
      ticks: $("symbol").value,
      subscribe: 1
    });

    renderDigits();
    updateAnalysis();
  }
});

renderDigits();
updateAnalysis();
