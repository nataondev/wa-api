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

# Pilihan region
echo "📍 Pilih region server:"
echo "=== Common Runtime (Basic Plan) ==="
echo "1) Europe (eu) - Frankfurt/Ireland"
echo "2) United States (us) - Default"

echo -e "\n=== Private Spaces (Enterprise Plan) ==="
echo "3) Dublin, Ireland (dublin)"
echo "4) Frankfurt, Germany (frankfurt)"
echo "5) London, UK (london)"
echo "6) Montreal, Canada (montreal)"
echo "7) Mumbai, India (mumbai)"
echo "8) Oregon, US (oregon)"
echo "9) Singapore (singapore)"
echo "10) Sydney, Australia (sydney)"
echo "11) Tokyo, Japan (tokyo)"
echo "12) Virginia, US (virginia)"

read -p "Pilih nomor region (1-12): " REGION_CHOICE

case $REGION_CHOICE in
    1) 
        REGION="eu"
        echo "✅ Selected: Europe (Common Runtime)"
        ;;
    2) 
        REGION="us"
        echo "✅ Selected: United States (Common Runtime)"
        ;;
    3|4|5|6|7|8|9|10|11|12)
        echo "⚠️ Region ini hanya tersedia untuk Private Spaces (Enterprise Plan)"
        echo "Menggunakan Europe sebagai alternatif..."
        REGION="eu"
        ;;
    *) 
        echo "❌ Pilihan tidak valid. Menggunakan Europe sebagai default."
        REGION="eu"
        ;;
esac

# Estimasi latency berdasarkan region
case $REGION in
    "eu")
        echo "📡 Estimasi latency dari Indonesia: ~250-350ms"
        ;;
    "us")
        echo "📡 Estimasi latency dari Indonesia: ~300-400ms"
        ;;
esac

# Cek apakah aplikasi sudah ada
if ! heroku apps:info -a "$APP_NAME" &> /dev/null; then
    echo "🆕 Membuat aplikasi baru di Heroku di region $REGION..."
    heroku create "$APP_NAME" --region "$REGION"
else
    echo "✅ Aplikasi '$APP_NAME' ditemukan."
    # Tampilkan region aplikasi yang sudah ada
    CURRENT_REGION=$(heroku info -a "$APP_NAME" | grep "Region" | awk '{print $2}')
    echo "📍 Region saat ini: $CURRENT_REGION"
fi

# Menambahkan Redis add-on
echo "⚙️ Menambahkan Redis add-on..."
echo "Pilih tier Redis:"
echo "1) hobby-dev (Free - 25MB)"
echo "2) premium-0 (Berbayar - 50MB)"
read -p "Pilihan Anda (1/2): " REDIS_CHOICE

case $REDIS_CHOICE in
    1)
        echo "🔄 Menambahkan Redis hobby-dev..."
        heroku addons:create heroku-redis:hobby-dev -a "$APP_NAME"
        ;;
    2)
        echo "🔄 Menambahkan Redis premium-0..."
        heroku addons:create heroku-redis:premium-0 -a "$APP_NAME"
        ;;
    *)
        echo "⚠️ Pilihan tidak valid. Menggunakan hobby-dev..."
        heroku addons:create heroku-redis:hobby-dev -a "$APP_NAME"
        ;;
esac

# Menunggu Redis siap
echo "⏳ Menunggu Redis siap..."
sleep 10

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

# Cek status Redis
echo "📊 Mengecek status Redis..."
heroku redis:info -a "$APP_NAME"

# Membuka aplikasi
echo "🌐 Membuka aplikasi di browser..."
heroku open -a "$APP_NAME"

echo "✅ Deployment selesai!"
echo "📱 Aplikasi Anda dapat diakses di: https://$APP_NAME.herokuapp.com"
echo "📝 Dokumentasi API tersedia di: https://$APP_NAME.herokuapp.com/docs"
echo "💡 Untuk memonitor Redis: heroku redis:metrics -a $APP_NAME" 