# WhatsApp API

Simple WhatsApp API menggunakan library Baileys.

## Updates & Improvements

### Latest Updates (02 Mar 2025)
- Penambahan panduan deployment lengkap ([lihat DEPLOYMENT.md](DEPLOYMENT.md))
- Penambahan quick deployment ke Heroku
- Optimasi region dan latency

## 🚀 Deployment

Untuk panduan lengkap deployment ke berbagai platform (Heroku, Railway, Render, dll), silakan lihat [DEPLOYMENT.md](DEPLOYMENT.md).

Tersedia panduan untuk:
- Heroku (Basic & Enterprise Plan)
- Railway (Free Tier, Region Singapore)
- Render (Free Tier, Region Singapore)
- Fly.io (Free Tier, Region Singapore)
- DigitalOcean App Platform ($5/month, Region Singapore)

## 🚀 Fitur Utama

- Multi-session WhatsApp
- Pengiriman pesan teks
- Pengiriman pesan media (gambar, video, dokumen)
- Pengiriman pesan massal (bulk messaging)
- Manajemen sesi (create, check status, logout)
- Penanganan memory leak yang optimal
- Graceful shutdown
- Error handling yang robust
- Sistem reconnection yang handal
- Logging yang terstruktur
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
APP_URL=127.0.0.1
APP_PORT=3000
ENABLE_API_KEY=true
API_KEY=your_api_key
LOG_LEVEL=info
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
    "viewOnce": false // Optional, default: false
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

### Utility
- `GET /utility/groups/:sessionId` - Daftar grup & peserta
- `POST /utility/check-number` - Cek status nomor WhatsApp

## ⚙️ Konfigurasi

### Logging Levels
```env
# Available levels: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

Level hierarchy:
- trace: Most detailed logging
- debug: Debugging information
- info: General information (default)
- warn: Warning messages
- error: Error messages
- fatal: Critical errors

## 🔄 Update Terbaru

### 1. Peningkatan Stabilitas
- Perbaikan error handling untuk error 515
- Sistem reconnection yang lebih handal
- Timeout dan cleanup yang optimal
- Logging yang lebih informatif dengan format [sessionId]

### 2. Fitur Utility
- Endpoint groups dengan informasi lengkap (peserta, admin, pengaturan)
- Verifikasi nomor WhatsApp yang lebih akurat
- Format nomor otomatis (08/+62 -> 62)

### 3. Optimasi
- Penyederhanaan path resolver
- Cleanup sesi yang lebih menyeluruh
- Penanganan memory leak yang lebih baik

## 📚 API Documentation

Dokumentasi API tersedia melalui Swagger UI di:
```
http://localhost:3000/docs
```

## 🤝 Kontribusi

Kontribusi selalu diterima! Silakan buat pull request atau laporkan issues jika menemukan bug.

## 📜 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
