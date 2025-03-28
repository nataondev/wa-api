const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = 3001;

// Secret key yang didapat saat setup webhook
const WEBHOOK_SECRET = "1c2rr1jn8fa";

// Middleware untuk parsing JSON
app.use(bodyParser.json());

// Middleware untuk logging request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === "POST") {
    // console.log("Headers:", JSON.stringify(req.headers, null, 2));
  }
  next();
});

// Endpoint untuk menerima webhook
app.post("/webhook", (req, res) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    const data = req.body;

    // Verifikasi secret key
    if (!secret || secret !== WEBHOOK_SECRET) {
      throw new Error("Invalid webhook secret");
    }

    // Log data webhook
    console.log("Webhook Data:", JSON.stringify(data, null, 2));

    // Handle webhook data
    const { sessionId, type, message, status } = data;
    console.log(`[${sessionId}] Received ${type} webhook:`);

    if (type === "message") {
      console.log("Data:", JSON.stringify(message, null, 2));
    } else if (type === "connection") {
      console.log("Data:", JSON.stringify(status, null, 2));
    }

    // Kirim response sukses
    res.status(200).json({
      status: true,
      message: "Webhook received successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(error.message === "Invalid webhook secret" ? 401 : 400).json({
      status: false,
      message: "Error processing webhook",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Endpoint untuk mengecek status webhook
app.get("/webhook/status", (req, res) => {
  res.json({
    status: true,
    message: "Webhook server is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: err.message,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`Webhook receiver running at http://localhost:${port}`);
  console.log("Available endpoints:");
  console.log("- POST /webhook - Receive webhook data");
  console.log("- GET /webhook/status - Check webhook status");
  console.log("\nWebhook will verify using X-Webhook-Secret header");
  console.log("Make sure to set WEBHOOK_SECRET environment variable");
});
