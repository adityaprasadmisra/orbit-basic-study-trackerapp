const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files for frontend

// Database Setup
const dbPath = path.resolve(__dirname, 'orbit.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('Connected to Orbit SQLite database at ' + dbPath);
});

// Init Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS daily_logs (
        date TEXT PRIMARY KEY,
        data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// Routes

// Get all logs (for initial load)
app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM daily_logs", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Convert array to object map
        const logs = {};
        rows.forEach(row => {
            logs[row.date] = JSON.parse(row.data);
        });
        res.json(logs);
    });
});

// Save a specific day's log
app.post('/api/log', (req, res) => {
    const { date, log } = req.body;
    if (!date || !log) return res.status(400).json({ error: "Missing fields" });

    const stmt = db.prepare("INSERT OR REPLACE INTO daily_logs (date, data) VALUES (?, ?)");
    stmt.run(date, JSON.stringify(log), (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Saved" });
    });
    stmt.finalize();
});

// Settings Endpoints
app.get('/api/settings', (req, res) => {
    db.get("SELECT value FROM settings WHERE id = 'user_config'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row ? JSON.parse(row.value) : {});
    });
});

app.post('/api/settings', (req, res) => {
    const config = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)");
    stmt.run('user_config', JSON.stringify(config), (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Settings Saved" });
    });
    stmt.finalize();
});

// Root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Meta/Global State (Course Progress)
app.get('/api/meta', (req, res) => {
    db.get("SELECT value FROM settings WHERE id = 'app_meta'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row ? JSON.parse(row.value) : null);
    });
});

app.post('/api/meta', (req, res) => {
    const data = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)");
    stmt.run('app_meta', JSON.stringify(data), (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Meta Saved" });
    });
    stmt.finalize();
});

// Migration Endpoint
app.post('/api/migrate', (req, res) => {
    const { store, settings } = req.body;

    db.serialize(() => {
        try {
            db.run("BEGIN TRANSACTION");

            // 1. Save Logs
            if (store.logs) {
                const stmtLog = db.prepare("INSERT OR REPLACE INTO daily_logs (date, data) VALUES (?, ?)");
                Object.entries(store.logs).forEach(([date, log]) => {
                    stmtLog.run(date, JSON.stringify(log));
                });
                stmtLog.finalize();
            }

            // 2. Save Global State (Courses & Streak)
            // We strip logs from store to save as app_meta
            const meta = { ...store };
            delete meta.logs;

            const stmtMeta = db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES (?, ?)");
            stmtMeta.run('app_meta', JSON.stringify(meta));

            // 3. Save User Settings
            if (settings) {
                stmtMeta.run('user_config', JSON.stringify(settings));
            }

            stmtMeta.finalize();

            db.run("COMMIT");
            res.json({ message: "Migration Successful" });
        } catch (err) {
            db.run("ROLLBACK");
            res.status(500).json({ error: err.message });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
