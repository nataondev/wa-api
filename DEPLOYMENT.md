# 🚀 Panduan Deployment

Dokumen ini berisi panduan lengkap untuk mendeploy WhatsApp API ke berbagai platform cloud.

## Heroku Deployment

### Metode Quick Deploy
1. Install Heroku CLI:
```bash
# MacOS
brew tap heroku/brew && brew install heroku

# Windows
winget install --id=Heroku.HerokuCLI -e

# Ubuntu
curl https://cli-assets.heroku.com/install.sh | sh
```

2. Clone repository dan masuk ke direktori:
```bash
git clone <repository-url>
cd <repository-name>
```

3. Jalankan script deployment:
```bash
./deploy-heroku.sh
```

### Manual Deploy

1. Login ke Heroku:
```bash
heroku login
```

2. Buat aplikasi baru dengan region terdekat:
```bash
# List available regions
heroku regions

# Create app with specific region (recommended: eu)
heroku create your-app-name --region eu
```

3. Set environment variables:
```bash
heroku config:set NODE_ENV=production
heroku config:set ENABLE_API_KEY=true
heroku config:set API_KEY=your_api_key
```

4. Deploy aplikasi:
```bash
git push heroku main
```

5. Pastikan minimal 1 dyno berjalan:
```bash
heroku ps:scale web=1
```

### Region Availability

#### Common Runtime (Basic Plan $7/month)
- Europe (eu) - Recommended untuk Asia
- United States (us)

#### Private Spaces (Enterprise Plan)
- Dublin, Ireland (dublin)
- Frankfurt, Germany (frankfurt)
- London, UK (london)
- Montreal, Canada (montreal)
- Mumbai, India (mumbai)
- Oregon, US (oregon)
- Singapore (singapore)
- Sydney, Australia (sydney)
- Tokyo, Japan (tokyo)
- Virginia, US (virginia)

### Estimasi Latency dari Indonesia
- Europe (eu): ~250-350ms
- United States (us): ~300-400ms

### Troubleshooting

1. Error R10 (Boot timeout):
```bash
# Check logs
heroku logs --tail

# Restart dyno
heroku restart
```

2. Application Error (H10):
```bash
# Check build logs
heroku builds:output

# Check release phase
heroku releases
```

3. Memory issues:
```bash
# Check memory usage
heroku metrics:web

# Scale dyno if needed
heroku ps:scale web=1:standard-1x
```

## Platform Alternatif

### 1. Railway
- Region: Singapore available
- Latency: ~50-100ms
- Free tier: Available
- Quick Deploy:
  ```bash
  railway init
  railway up
  ```

### 2. Render
- Region: Singapore available
- Latency: ~50-100ms
- Free tier: Available
- Auto deploy from GitHub
- [Panduan Lengkap Render](https://render.com/docs)

### 3. Fly.io
- Region: Singapore available
- Latency: ~50-100ms
- Free tier: 3 shared-cpu-1x VMs
- Deploy:
  ```bash
  flyctl launch
  flyctl deploy
  ```
- [Panduan Lengkap Fly.io](https://fly.io/docs/getting-started/)

### 4. DigitalOcean App Platform
- Region: Singapore (sgp1)
- Latency: ~30-70ms
- Starting: $5/month
- Managed SSL & custom domains
- [Panduan DO App Platform](https://www.digitalocean.com/docs/app-platform/) 