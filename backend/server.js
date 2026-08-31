const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const APP_ID = "167308681";
const API_TOKEN = process.env.DERIV_API_TOKEN || process.env.DERIV_TOKEN || "";
const PORT = process.env.PORT || 10000;

const app = express();
const server = http.createServer(app);

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Deriv Even/Odd Bot Backend",
    app_id: APP_ID,
    token_configured: Boolean(API_TOKEN)
  });
});

// Status check
app.get("/api/status", (req, res) => {
  res.json({
    backend: "running",
    app_id: APP_ID,
    token_configured: Boolean(API_TOKEN)
  });
});

// WebSocket server for the website
const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (client) => {
  console.log("Browser connected");

  if (!API_TOKEN) {
    client.send(JSON.stringify({
      type: "error",
      error: "DERIV_API_TOKEN is not configured on Render."
    }));

    client.close();
    return;
  }

  const derivURL =
    `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

  const deriv = new WebSocket(derivURL);

  // Connected to Deriv
  deriv.on("open", () => {
    console.log("Connected to Deriv");

    client.send(JSON.stringify({
      type: "deriv_connection",
      status: "connected"
    }));

    // Authorize using Render environment variable
    deriv.send(JSON.stringify({
      authorize: API_TOKEN
    }));
  });

  // Messages from Deriv
  deriv.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.error) {
        console.log("Deriv error:", message.error);

        client.send(JSON.stringify({
          type: "deriv_error",
          error: message.error
        }));

        return;
      }

      if (message.msg_type === "authorize") {
        console.log("Deriv authorization successful");

        client.send(JSON.stringify({
          type: "authorized",
          status: "success",
          authorize: message.authorize
        }));

        return;
      }

      // Forward Deriv response to browser
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }

    } catch (error) {
      console.log("Invalid Deriv response");
    }
  });

  // Deriv connection error
  deriv.on("error", (error) => {
    console.log("Deriv WebSocket error:", error.message);

    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "deriv_error",
        error: error.message
      }));
    }
  });

  // Deriv connection closed
  deriv.on("close", (code, reason) => {
    console.log("Deriv connection closed:", code);

    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "deriv_connection",
        status: "closed",
        code: code,
        reason: reason ? reason.toString() : ""
      }));
    }
  });

  // Messages from browser → Deriv
  client.on("message", (data) => {
    if (deriv.readyState !== WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "error",
        error: "Deriv connection is not open yet."
      }));

      return;
    }

    try {
      const request = JSON.parse(data.toString());

      // Do not allow browser to override App ID or token
      delete request.app_id;
      delete request.authorize;

      deriv.send(JSON.stringify(request));

    } catch (error) {
      client.send(JSON.stringify({
        type: "error",
        error: "Invalid request."
      }));
    }
  });

  // Browser disconnected
  client.on("close", () => {
    console.log("Browser disconnected");

    if (
      deriv &&
      deriv.readyState === WebSocket.OPEN
    ) {
      deriv.close();
    }
  });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Deriv App ID: ${APP_ID}`);
  console.log(`Token configured: ${Boolean(API_TOKEN)}`);
});
