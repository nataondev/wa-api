const axios = require("axios");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const apiKey = process.env.API_KEY || "kentut_nata2";

// Array nama buah dan sayur
const items = [
  "Apel",
  "Pisang",
  "Mangga",
  "Jeruk",
  "Anggur",
  "Pepaya",
  "Nanas",
  "Semangka",
  "Melon",
  "Durian",
  "Wortel",
  "Bayam",
  "Kangkung",
  "Brokoli",
  "Kubis",
  "Tomat",
  "Timun",
  "Terong",
  "Labu",
  "Jagung",
];

// Fungsi untuk mendapatkan item random dari array
const getRandomItem = () => {
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
};

// Fungsi untuk delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fungsi untuk mengirim pesan
async function sendMessage(session, target, message, apiKey, index) {
  try {
    console.log(`Mengirim pesan ke-${index}: ${message}`);
    const response = await axios.post(
      "http://localhost:3000/messages/send",
      {
        sender: session,
        receiver: target,
        message: message,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          accept: "application/json",
        },
      }
    );
    console.log(`Pesan ke-${index} terkirim!`);
    return { success: true, index, response: response.data };
  } catch (error) {
    console.error(`Error mengirim pesan ke-${index}: ${error.message}`);
    return { success: false, index, error: error.message };
  }
}

// Fungsi utama untuk mengirim batch pesan
async function sendBatchMessages(count, target, session = "session_id_1") {
  console.log(`Akan mengirim ${count} pesan ke nomor ${target}...`);
  console.log(`Session ID: ${session}`);
  console.log("-----------------------------------");

  // Buat array of promises untuk semua pesan
  const promises = Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    const item = getRandomItem();
    const message = `Test pesan ke-${index}: ${item}`;

    // Tambahkan sedikit delay random untuk menghindari rate limiting
    const initialDelay = Math.random() * 500; // delay 0-500ms

    return delay(initialDelay).then(() =>
      sendMessage(session, target, message, apiKey, index)
    );
  });

  // Kirim semua pesan secara paralel
  const results = await Promise.all(promises);

  // Tampilkan ringkasan hasil
  const successful = results.filter((r) => r.success).length;
  console.log("\nRingkasan Pengiriman:");
  console.log(`Total pesan terkirim: ${successful}/${count}`);
  console.log(`Total pesan gagal: ${count - successful}`);

  if (count - successful > 0) {
    console.log("\nDetail pesan gagal:");
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`Pesan ke-${r.index}: ${r.error}`));
  }
}

// Mengambil argumen dari command line
const args = process.argv.slice(2);
const count = parseInt(args[0]);
const target = args[1];

// Validasi input
if (!count || !target) {
  console.log(
    "Usage: node test-batch-message.js <jumlah_pesan> <nomor_tujuan>"
  );
  console.log("Example: node test-batch-message.js 5 6281234567890");
  process.exit(1);
}

// Jalankan fungsi utama
sendBatchMessages(count, target, "session_id_1").catch(console.error);
sendBatchMessages(count, target, "session_id_2").catch(console.error);
