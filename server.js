const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 1. Konfigurasi Database MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
    ssl: { rejectUnauthorized: false } 
});

db.connect((err) => {
    if (err) {
        console.error('Gagal koneksi ke Database: ' + err.stack);
        return;
    }
    console.log('Terhubung ke Database MySQL.');
});

// 2. Konfigurasi Azure Blob Storage
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.CONTAINER_NAME || 'tugas-praktikum';
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

// --- BAGIAN EDIT UNTUK FIX "CANNOT GET /" ---
app.use(express.static(__dirname)); // Mengizinkan akses file di folder utama
app.use(express.urlencoded({ extended: true }));

// Route untuk menampilkan halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// --------------------------------------------

// 3. Endpoint POST untuk Submit Tugas
app.post('/submit', upload.single('taskFile'), async (req, res) => {
    try {
        const { nim, name, class: className, course } = req.body;
        const file = req.file;

        if (!file) return res.status(400).send('File tidak ditemukan.');

        const blobName = `${nim}_${Date.now()}_${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        console.log(`Mengunggah file ${blobName} ke Azure Storage...`);
        await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype }
        });

        const fileUrl = blockBlobClient.url;

        const sql = "INSERT INTO submissions (nim, name, class, course, file_url, status) VALUES (?, ?, ?, ?, ?, 'Submitted')";
        db.query(sql, [nim, name, className, course, fileUrl], (err, result) => {
            if (err) throw err;
            res.send(`
                <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                    <h2>✅ Sukses!</h2>
                    <p>Tugas atas nama <b>${name}</b> berhasil dikirim.</p>
                    <p>URL File: <a href="${fileUrl}" target="_blank">Lihat di Storage</a></p>
                    <a href="/">Kembali ke Form</a>
                </div>
            `);
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi kesalahan sistem: ' + error.message);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server aktif di port ${PORT}`);
});
