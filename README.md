# Bandartoto EJS Portal Prediksi Bola

Project sudah digabung dengan CMS berita/prediksi otomatis berbasis EJS + JSON DB.

## Fitur

- Admin login via ENV `ADMIN_ID` dan `ADMIN_PASSWORD`
- DATA_DIR persistence untuk Railway Volume
- CMS Posts / Berita
- Upload thumbnail ke `/uploads` dari `DATA_DIR/uploads`
- Slug URL otomatis
- Tabel prediksi dinamis per liga
- Sidebar latest post
- Banner ads sidebar
- Search post
- Category page
- Sitemap XML otomatis `/sitemap.xml`
- Robots txt otomatis `/robots.txt`
- Live score lama tetap jalan

## ENV Railway

```env
ADMIN_ID=admin
ADMIN_PASSWORD=passwordku
SESSION_SECRET=ganti-random-panjang
DATA_DIR=/data
BASE_URL=https://domainkamu.com
PORT=8080
API_FOOTBALL_KEY=isi_key_jika_pakai_live_score
NODE_ENV=production
```

## Cara Jalan Lokal

```bash
npm install
npm start
```

Buka:

- Website: `http://localhost:8080`
- Admin: `http://localhost:8080/admin/login`

## Format Data Prediksi di Admin

Masukkan JSON seperti ini di field `Data Prediksi JSON`:

```json
[
  {
    "league": "BRI Super League",
    "matches": [
      { "match": "PSIM vs Persija", "pick": "2", "ou": "OVER", "score": "1 - 2" },
      { "match": "Persis vs Bhayangkara", "pick": "X", "ou": "UNDER", "score": "1 - 1" }
    ]
  },
  {
    "league": "Italian Serie A",
    "matches": [
      { "match": "Inter Milan vs Lazio", "pick": "1", "ou": "OVER", "score": "2 - 1" }
    ]
  }
]
```
