#!/bin/bash

echo "🚀 Memulai deployment ke Heroku..."

# Memastikan Heroku CLI terinstall
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI tidak ditemukan. Silakan install terlebih dahulu."
    echo "💡 Kunjungi: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Memastikan git terinstall
if ! command -v git &> /dev/null; then
    echo "❌ Git tidak ditemukan. Silakan install terlebih dahulu."
    exit 1
fi

# Cek apakah sudah login ke Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo "🔑 Silakan login ke Heroku terlebih dahulu..."
    heroku login
fi

# Mendapatkan nama aplikasi Heroku
echo "📝 Masukkan nama aplikasi Heroku Anda:"
read APP_NAME

# Cek apakah aplikasi sudah ada
if ! heroku apps:info -a "$APP_NAME" &> /dev/null; then
    echo "🆕 Membuat aplikasi baru di Heroku..."
    heroku create "$APP_NAME"
else
    echo "✅ Aplikasi '$APP_NAME' ditemukan."
fi

# Set environment variables
echo "⚙️ Mengatur environment variables..."
heroku config:set NODE_ENV=production -a "$APP_NAME"
echo "📝 Masukkan API Key Anda:"
read API_KEY
heroku config:set API_KEY="$API_KEY" -a "$APP_NAME"
heroku config:set ENABLE_API_KEY=true -a "$APP_NAME"

# Deploy ke Heroku
echo "🚀 Mendeploy aplikasi ke Heroku..."
git push heroku main

# Memastikan minimal 1 dyno berjalan
echo "⚙️ Memastikan aplikasi berjalan..."
heroku ps:scale web=1 -a "$APP_NAME"

# Membuka aplikasi
echo "🌐 Membuka aplikasi di browser..."
heroku open -a "$APP_NAME"

echo "✅ Deployment selesai!"
echo "📱 Aplikasi Anda dapat diakses di: https://$APP_NAME.herokuapp.com"
echo "📝 Dokumentasi API tersedia di: https://$APP_NAME.herokuapp.com/docs" 