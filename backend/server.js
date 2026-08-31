const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const APP_ID = "167308681";
const API_TOKEN =
  process.env.DERIV_API_TOKEN ||
  process.env.DERIV_TOKEN ||
  "";

const PORT = process.env.PORT || 10000;

const app = express();
const server = http.createServer(app);

/*
  Allow the GitHub Pages website to communicate
  with this Render backend.
*/
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/*
  Basic Render health check.
*/
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Deriv Even/Odd Bot Backend",
    app_id: APP_ID,
    token_configured: Boolean(API_TOKEN)
  });
});

/*
  API status check.
*/
app.get("/api/status", (req, res) => {
  res.json({
    status: "running",
    app_id: APP_ID,
    token_configured: Boolean(API_TOKEN)
  });
});

/*
  WebSocket server.
*/
const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (client) => {
  console.log("Browser connected to backend");

  if (!API_TOKEN) {
    client.send(
      JSON.stringify({
        type: "error",
        error: "DERIV_API_TOKEN is not configured on Render."
      })
    );

    client.close(1008, "API token not configured");
    return;
  }

  const derivURL =
    `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

  console.log("Connecting to Deriv...");
  console.log("Using App ID:", APP_ID);

  const deriv = new WebSocket(derivURL);

  /*
    Connection from backend to Deriv.
  */
  deriv.on("open", () => {
    console.log("Connected to Deriv");

    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "deriv_connection",
          status: "connected"
        })
      );
    }

    /*
      Authorize using the token stored
      in Render environment variables.
    */
    deriv.send(
      JSON.stringify({
        authorize: API_TOKEN
      })
    );
  });

  /*
    Messages coming from Deriv.
  */
  deriv.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      console.log("Invalid JSON received from Deriv");
      return;
    }

    console.log(
      "Deriv message:",
      message.msg_type || "response"
    );

    /*
      Deriv API error.
    */
    if (message.error) {
      console.log(
        "Deriv API error:",
        message.error.message || message.error
      );

      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "deriv_error",
            error: message.error
          })
        );
      }

      return;
    }

    /*
      Successful authorization.
    */
    if (message.msg_type === "authorize") {
      console.log("Deriv authorization successful");

      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "authorized",
            status: "success",
            authorize: message.authorize
          })
        );
      }

      return;
    }

    /*
      Forward other Deriv responses
      to the website.
    */
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });

  /*
    Deriv WebSocket error.
  */
  deriv.on("error", (error) => {
    console.log(
      "Deriv WebSocket error:",
      error.message
    );

    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "deriv_error",
          error: error.message
        })
      );
    }
  });

  /*
    Deriv WebSocket closed.
  */
  deriv.on("close", (code, reason) => {
    console.log(
      "Deriv connection closed:",
      code,
      reason ? reason.toString() : ""
    );

    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "deriv_connection",
          status: "closed",
          code: code,
          reason: reason
            ? reason.toString()
            : ""
        })
      );
    }
  });

  /*
    Messages from the website to Deriv.
  */
  client.on("message", (data) => {
    if (deriv.readyState !== WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "error",
          error: "Deriv connection is not open."
        })
      );

      return;
    }

    let request;

    try {
      request = JSON.parse(data.toString());
    } catch (error) {
      client.send(
        JSON.stringify({
          type: "error",
          error: "Invalid JSON request."
        })
      );

      return;
    }

    /*
      The browser must never be able to
      replace our App ID or API token.
    */
    delete request.app_id;
    delete request.authorize;

    deriv.send(JSON.stringify(request));
  });

  /*
    Browser disconnected.
  */
  client.on("close", () => {
    console.log("Browser disconnected");

    if (deriv.readyState === WebSocket.OPEN) {
      deriv.close();
    }
  });

  client.on("error", (error) => {
    console.log(
      "Browser WebSocket error:",
      error.message
    );

    if (deriv.readyState === WebSocket.OPEN) {
      deriv.close();
    }
  });
});

/*
  Start Render server.
*/
server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server running on port ${PORT}`
  );

  console.log(
    `Deriv App ID: ${APP_ID}`
  );

  console.log(
    `API token configured: ${Boolean(API_TOKEN)}`
  );
});
