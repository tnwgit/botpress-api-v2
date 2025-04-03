// Voeg de feedback tabel toe aan de schema
const schema = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        naam TEXT,
        rol TEXT
    );

    CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        naam TEXT,
        webhook TEXT,
        created_by INTEGER,
        FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT,
        user_id TEXT,
        conversation_id TEXT,
        rating INTEGER,
        comment TEXT,
        name TEXT,
        chat_history JSON,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(bot_id) REFERENCES bots(id)
    );
`; 