# WhatsApp API

WhatsApp API menggunakan library Baileys dengan fitur multi-session dan webhook.

## Updates & Improvements

### Latest Updates (28 Mar 2025)
- Peningkatan sistem antrian dengan dukungan delay dinamis
- Implementasi webhook untuk pesan masuk dan status koneksi
- Penambahan contoh implementasi batch messaging

## 🚀 Deployment

Untuk panduan lengkap deployment ke berbagai platform (Heroku, Railway, Render, dll), silakan lihat [DEPLOYMENT.md](DEPLOYMENT.md).

## 🚀 Fitur Utama

- Multi-session WhatsApp
- Pengiriman pesan teks
- Pengiriman pesan media (gambar, video, dokumen)
- Pengiriman pesan massal (bulk messaging) dengan:
  - Sistem antrian
  - Retry otomatis untuk pesan gagal
  - Monitoring status pengiriman
- Manajemen sesi (create, check status, logout)
- Penanganan memory leak yang optimal
- Graceful shutdown
- Error handling yang robust
- Sistem reconnection yang handal
- Logging yang terstruktur
- Webhook untuk pesan masuk dan status koneksi
- Utilitas WhatsApp:
  - Cek status nomor
  - Daftar grup & peserta
  - Mention feature untuk grup & private chat

## 📋 Prasyarat

- Node.js (versi 18 atau lebih baru)
- NPM atau Yarn
- API Key (untuk autentikasi)

## 🛠️ Instalasi & Penggunaan

1. Install dependensi:
```bash
npm install
```

2. Salin file .env.example ke .env dan sesuaikan:
```env
NODE_ENV=local
PORT=3000
ENABLE_API_KEY=true
API_KEY=your_api_key
LOG_LEVEL=info
GLOBAL_WEBHOOK_URL=https://your-webhook-url.com # Optional
```

3. Jalankan server:
```bash
npm run start
```

## 📱 API Endpoints

### Sessions
- `POST /sessions/:sessionId` - Membuat/menggunakan sesi
- `GET /sessions/:sessionId` - Cek status sesi
- `POST /sessions/:sessionId/logout` - Logout sesi

### Messages
- `POST /messages/send` - Kirim pesan (teks/media)
  ```json
  {
    "sender": "session_id_1",
    "receiver": "6285123456789",
    "message": "Hello World!",
    "file": "https://example.com/image.jpg", // Optional
    "viewOnce": false, // Optional, default: false
  }
  ```

- `POST /messages/mention` - Kirim pesan dengan mention
  ```json
  {
    "sender": "session_id_1",
    "receiver": "6285123456789 or group_id@g.us",
    "message": "Hello @user!"
  }
  ```

- `POST /messages/batch` - Kirim pesan massal
  ```json
  {
    "sender": "session_id_1",
    "receivers": ["6285123456789", "6285987654321"],
    "message": "Hello World!",
  }
  ```

### Webhook
- `POST /webhook/set/:sessionId` - Set webhook untuk sesi tertentu
  ```json
  {
    "url": "https://your-webhook-url.com"
  }
  ```
- `GET /webhook/status` - Cek status webhook (global & per-sesi)

### Utility
- `GET /utility/groups/:sessionId` - Daftar grup & peserta
- `POST /utility/check-number` - Cek status nomor WhatsApp

## ⚙️ Konfigurasi

### Logging Levels
```env
# Available levels: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

### Queue Configuration
```env
# Queue settings (default)
QUEUE_BATCH_SIZE=5
QUEUE_BATCH_DELAY=1000
QUEUE_MAX_RETRIES=3
QUEUE_RETRY_DELAY=2000
QUEUE_TIMEOUT=30000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

This API now uses Redis-based queue (Bull) to handle message processing. This provides several benefits:
- Persistence: Messages will survive server restarts
- Scalability: Multiple instances of the API can share the same queue
- Reliability: Failed jobs can be retried automatically
- Monitoring: Queue status can be easily monitored

To use this feature, you need to have Redis server running. You can install Redis locally or use a cloud-based service.

#### Local Redis Installation

For development purposes, you can run Redis locally:

**For Windows:**
1. Use WSL (Windows Subsystem for Linux)
2. Use Docker: `docker run -p 6379:6379 redis`

**For Linux:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**For macOS:**
```bash
brew install redis
brew services start redis
```

#### Queue Monitoring

You can check the status of the queue by calling the API endpoint `/api/queue/status/:sessionId`.

### Webhook Configuration
```env
# Global webhook URL (optional)
GLOBAL_WEBHOOK_URL=https://your-webhook-url.com
```

## 🔄 Update Terbaru

### 1. Sistem Antrian
- Implementasi antrian untuk pengiriman pesan batch
- Konfigurasi batch size dan delay yang fleksibel
- Sistem retry otomatis untuk pesan gagal
- Monitoring status antrian
- Pemisahan antrian per sesi WhatsApp

### 2. Sistem Webhook
- Webhook global dan per-sesi
- Event untuk pesan masuk dan status koneksi
- Penyimpanan konfigurasi webhook ke file
- Format payload yang terstruktur
- Logging untuk monitoring

### 3. Peningkatan Stabilitas
- Perbaikan error handling untuk error 515
- Sistem reconnection yang lebih handal
- Timeout dan cleanup yang optimal
- Logging yang lebih informatif dengan format [sessionId]

### 4. Fitur Utility
- Endpoint groups dengan informasi lengkap (peserta, admin, pengaturan)
- Verifikasi nomor WhatsApp yang lebih akurat
- Format nomor otomatis (08/+62 -> 62)

### 5. Optimasi
- Penyederhanaan path resolver
- Cleanup sesi yang lebih menyeluruh
- Penanganan memory leak yang lebih baik

## 📚 API Documentation

Dokumentasi API tersedia melalui Swagger UI di:
```
http://localhost:3000/docs
```

## Webhook

Sistem webhook memungkinkan Anda untuk menerima notifikasi real-time tentang:
- Pesan masuk
- Status koneksi
- QR Code generation
- Perubahan status sesi

### Format Webhook

1. Pesan Masuk:
```json
{
  "type": "message",
  "sessionId": "session1",
  "message": {
    "key": {
      "remoteJid": "6281234567890@s.whatsapp.net",
      "id": "1234567890"
    },
    "message": {
      "conversation": "Hello World!"
    }
  }
}
```

2. Status Koneksi:
```json
{
  "type": "connection",
  "sessionId": "session1",
  "status": "open",
  "qr": "base64_qr_code" // Jika ada
}
```

### Contoh Implementasi Webhook

Silahkan lihat contoh implementasi webhook di [examples/webhook-receiver.js](examples/webhook-receiver.js)


### Contoh Test Batch Messaging

Untuk  test queue, silakan lihat [examples/test-batch-message.js](examples/test-batch-message.js)

### Menggunakan Webhook

1. Set webhook URL untuk sesi tertentu:
```bash
curl -X POST http://localhost:3000/webhook/set/session1 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"url": "http://your-webhook-url/webhook"}'
```

2. Cek status webhook:
```bash
curl http://localhost:3000/webhook/status
```

3. Jalankan webhook receiver (contoh menggunakan Node.js):
```bash
cd examples
npm install express body-parser
node webhook-receiver.js
```

## Sistem Antrian

Sistem menggunakan antrian untuk mengatur pengiriman pesan dengan konfigurasi:
- Batch size: 5 pesan
- Delay: 1 detik antar batch
- Max retries: 3x
- Retry delay: 2 detik
- Timeout: 30 detik

## 🤝 Kontribusi

Kontribusi selalu diterima! Silakan buat pull request atau laporkan issues jika menemukan bug.

## 📜 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).