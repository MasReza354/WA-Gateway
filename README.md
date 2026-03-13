# WA Gateway

WhatsApp Gateway berbasis Node.js dengan antarmuka web modern untuk mengirim pesan WhatsApp melalui API.

## ✨ Fitur

- **Kirim Pesan** - Teks, Media, Lokasi, Kontak, Sticker
- **Kirim Massal** - Broadcast ke banyak nomor dengan delay
- **Jadwal Pesan** - Atur pengiriman pesan otomatis
- **Auto Reply** - Balas pesan otomatis berdasarkan keyword
- **Multi Session** - Kelola beberapa akun WhatsApp
- **Riwayat Pesan** - Log semua pesan terkirim
- **REST API** - Integrasi dengan sistem eksternal
- **UI Modern** - Tampilan responsif dengan Tailwind CSS

## 📋 Persyaratan

- Node.js v18+
- MySQL Database
- NPM atau Yarn

## 🚀 Instalasi

1. Clone repository
```bash
git clone https://github.com/MasReza354/WA-Gateway.git
cd WA-Gateway
```

2. Install dependencies
```bash
npm install
```

3. Konfigurasi environment
```bash
cp .env.example .env
```

Edit file `.env`:
```env
PORT=8081
SESSION_NAME=session_1
SESSION_PATH=./session
LOG_PATH=./public/log
AUTO_START=y

# Database
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=wa_gateway

# Admin Login
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

4. Buat database MySQL
```sql
CREATE DATABASE wa_gateway;
```

5. Jalankan aplikasi
```bash
npm start
```

6. Buka browser: `http://localhost:8081`

## 📱 Cara Pakai

1. Login dengan username & password dari `.env`
2. Scan QR Code di halaman Dashboard
3. Tunggu hingga status "Connected"
4. Mulai kirim pesan!

## 🔌 API Endpoints

### Kirim Teks
```http
POST /api/sendtext
Content-Type: application/json

{
  "sessions": "session_1",
  "target": "628123456789",
  "message": "Halo!"
}
```

### Kirim Media
```http
POST /api/sendmedia
Content-Type: multipart/form-data

sessions: session_1
target: 628123456789
caption: Deskripsi
file: [file]
```

### Kirim Lokasi
```http
POST /api/sendlocation
Content-Type: application/json

{
  "sessions": "session_1",
  "target": "628123456789",
  "lat": "-6.200000",
  "long": "106.816666"
}
```

### Kirim Kontak
```http
POST /api/sendcontact
Content-Type: application/json

{
  "sessions": "session_1",
  "target": "628123456789",
  "number": "628987654321",
  "name": "John Doe"
}
```

### Kirim Sticker
```http
POST /api/sendsticker
Content-Type: multipart/form-data

sessions: session_1
target: 628123456789
file: [image]
packname: StickerPack
author: Author
```

## 📁 Struktur Folder

```
wa-gate/
├── lib/                # Helper functions
├── public/             # Static files
├── server/
│   ├── config/         # App configuration
│   ├── database/       # Models & DB handlers
│   ├── middleware/     # Auth middleware
│   ├── router/         # API & Dashboard routes
│   ├── scheduler/      # Message scheduler
│   └── session/        # WhatsApp client
├── session/            # WhatsApp session data
├── views/              # EJS templates
├── .env                # Environment config
└── package.json
```

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL, Sequelize ORM
- **WhatsApp**: Baileys Library
- **Frontend**: EJS, Tailwind CSS
- **Realtime**: Socket.IO

## ⚠️ Disclaimer

Proyek ini hanya untuk keperluan edukasi. Penggunaan untuk spam atau aktivitas ilegal adalah tanggung jawab pengguna.

## 📄 Lisensi

ISC License
