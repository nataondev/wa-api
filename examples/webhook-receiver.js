const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = 3001; // Port berbeda dari server utama

// Middleware untuk parsing JSON
app.use(bodyParser.json());

// Middleware untuk logging request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint untuk menerima webhook
app.post("/webhook", (req, res) => {
  try {
    const data = req.body;
    console.log("Webhook Data:", JSON.stringify(data, null, 2));

    // Cek tipe webhook
    switch (data.type) {
      case "message":
        handleMessageWebhook(data);
        break;
      case "connection":
        handleConnectionWebhook(data);
        break;
      default:
        console.log("Unknown webhook type:", data.type);
    }

    // Kirim response sukses
    res.status(200).json({
      status: true,
      message: "Webhook received successfully",
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({
      status: false,
      message: "Error processing webhook",
      error: error.message,
    });
  }
});

// Handler untuk webhook pesan
function handleMessageWebhook(data) {
  const { sessionId, message } = data;
  console.log(`[${sessionId}] New message received:`);
  console.log("- From:", message.key.remoteJid);
  console.log("- Message ID:", message.key.id);
  console.log("- Type:", message.message?.conversation ? "text" : "media");
  console.log("- Content:", message.message?.conversation || "Media message");
}

// Handler untuk webhook koneksi
function handleConnectionWebhook(data) {
  const { sessionId, status, qr } = data;
  console.log(`[${sessionId}] Connection update:`);
  console.log("- Status:", status);
  if (qr) {
    console.log("- QR Code available");
  }
}

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
  });
});

// Start server
app.listen(port, () => {
  console.log(`Webhook receiver running at http://localhost:${port}`);
  console.log("Available endpoints:");
  console.log("- POST /webhook - Receive webhook data");
  console.log("- GET /webhook/status - Check webhook status");
});
