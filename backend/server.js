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
      error: "DERIV_APP_ID is not configured"
    });
  }

  const ws = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`
  );

  let finished = false;

  const finish = (status, data) => {
    if (finished) return;
    finished = true;

    try {
      ws.close();
    } catch (_) {}

    res.status(status).json(data);
  };

  ws.on("open", () => {
    ws.send(JSON.stringify({
      authorize: token
    }));
  });

  ws.on("message", (message) => {
    let data;

    try {
      data = JSON.parse(message.toString());
    } catch (_) {
      return finish(502, {
        error: "Invalid response from Deriv"
      });
    }

    if (data.error) {
      return finish(401, {
        error: data.error.message || "Deriv authorization failed",
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

  ws.on("error", () => {
    finish(502, {
      error: "Could not connect to Deriv"
    });
  });

  ws.on("close", () => {
    if (!finished) {
      finish(502, {
        error: "Deriv WebSocket closed before authorization completed"
      });
    }
  });

  setTimeout(() => {
    finish(504, {
      error: "Deriv connection timed out"
    });
  }, 15000);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
