require("dotenv").config();

const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Deriv Even/Odd Bot backend is running"
  });
});

app.post("/connect", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      error: "API token is required"
    });
  }

  const appId = process.env.DERIV_APP_ID;

  if (!appId) {
    return res.status(500).json({
      error: "DERIV_APP_ID is not configured in Render"
    });
  }

  const url =
    `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`;

  console.log("Attempting Deriv connection...");
  console.log("App ID:", appId);
  console.log("WebSocket URL:", url);

  const ws = new WebSocket(url);

  let finished = false;

  function finish(status, data) {
    if (finished) return;
    finished = true;

    try {
      ws.close();
    } catch (_) {}

    return res.status(status).json(data);
  }

  ws.on("open", () => {
    console.log("Deriv WebSocket OPEN");

    ws.send(JSON.stringify({
      authorize: token
    }));
  });

  ws.on("message", (message) => {
    console.log("Received message from Deriv");

    let data;

    try {
      data = JSON.parse(message.toString());
    } catch (error) {
      console.log("Invalid JSON from Deriv");
      return finish(502, {
        error: "Invalid response from Deriv"
      });
    }

    console.log("Deriv response:", JSON.stringify(data));

    if (data.error) {
      return finish(401, {
        error: data.error.message || "Deriv rejected the request",
        code: data.error.code || "UNKNOWN"
      });
    }

    if (data.msg_type === "authorize") {
      return finish(200, {
        success: true,
        loginid: data.authorize?.loginid || null,
        currency: data.authorize?.currency || null,
        balance: data.authorize?.balance ?? null
      });
    }
  });

  ws.on("error", (error) => {
    console.log("DERIV WEBSOCKET ERROR:", error.message);
    console.log("FULL ERROR:", error);

    finish(502, {
      error: "Deriv WebSocket error: " +
        (error.message || "unknown error")
    });
  });

  ws.on("close", (code, reason) => {
    console.log("DERIV WEBSOCKET CLOSED");
    console.log("Close code:", code);
    console.log("Close reason:", reason.toString());

    if (!finished) {
      finish(502, {
        error:
          "Deriv WebSocket closed. Code " +
          code +
          ". Reason: " +
          (reason.toString() || "none")
      });
    }
  });

  setTimeout(() => {
    if (!finished) {
      console.log("Deriv connection timed out");

      finish(504, {
        error: "Deriv connection timed out"
      });
    }
  }, 15000);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
