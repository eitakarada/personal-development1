<?php
declare(strict_types=1);

function get_pdo(): PDO
{
    $databaseUrl = getenv('DATABASE_URL');
    if ($databaseUrl !== false && $databaseUrl !== '') {
        $database = parse_url($databaseUrl);
        if ($database === false || empty($database['host']) || empty($database['user']) || empty($database['path'])) {
            throw new RuntimeException('DATABASE_URL が正しくありません');
        }

        $dsn = 'pgsql:host=' . $database['host']
            . ';port=' . ($database['port'] ?? 5432)
            . ';dbname=' . ltrim($database['path'], '/')
            . ';sslmode=require';
        $pdo = new PDO(
            $dsn,
            rawurldecode($database['user']),
            rawurldecode($database['pass'] ?? '')
        );
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        return $pdo;
    }

    $dataDir = dirname(__DIR__) . '/data';
    $dbPath = $dataDir . '/auth.sqlite';

    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0777, true);
    }

    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quote TEXT NOT NULL,
            author TEXT,
            source TEXT,
            reason TEXT,
            emotion TEXT,
            favorite INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            memo TEXT NOT NULL,
            emotion TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (quote_id) REFERENCES quotes(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (friend_id) REFERENCES users(id),
            UNIQUE(user_id, friend_id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS shared_stars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            original_quote_id INTEGER NOT NULL,
            original_user_id INTEGER NOT NULL,
            quote TEXT NOT NULL,
            author TEXT,
            source TEXT,
            emotion TEXT,
            reason TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (original_quote_id) REFERENCES quotes(id),
            FOREIGN KEY (original_user_id) REFERENCES users(id)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS favorite_rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quote_id INTEGER NOT NULL,
            is_shared INTEGER DEFAULT 0,
            rank INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, rank)
        )'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS friend_star_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            star_owner_id INTEGER NOT NULL,
            quote_id INTEGER NOT NULL,
            is_shared INTEGER DEFAULT 0,
            commenter_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (star_owner_id) REFERENCES users(id),
            FOREIGN KEY (commenter_id) REFERENCES users(id)
        )'
    );

    // ── マイグレーション: 既存テーブルへのカラム追加 ──
    $existing = array_column(
        $pdo->query('PRAGMA table_info(quotes)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );
    if (!in_array('is_public', $existing, true)) {
        $pdo->exec('ALTER TABLE quotes ADD COLUMN is_public INTEGER DEFAULT 1');
    }

    $existingSS = array_column(
        $pdo->query('PRAGMA table_info(shared_stars)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );
    if (!in_array('reason', $existingSS, true)) {
        $pdo->exec('ALTER TABLE shared_stars ADD COLUMN reason TEXT');
    }
    if (!in_array('favorite', $existingSS, true)) {
        $pdo->exec('ALTER TABLE shared_stars ADD COLUMN favorite INTEGER DEFAULT 0');
    }

    $existingRef = array_column(
        $pdo->query('PRAGMA table_info(reflections)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );
    if (!in_array('is_shared', $existingRef, true)) {
        $pdo->exec('ALTER TABLE reflections ADD COLUMN is_shared INTEGER DEFAULT 0');
    }

    $existingFR = array_column(
        $pdo->query('PRAGMA table_info(favorite_rankings)')->fetchAll(PDO::FETCH_ASSOC),
        'name'
    );
    if (!in_array('is_shared', $existingFR, true)) {
        $pdo->exec('ALTER TABLE favorite_rankings ADD COLUMN is_shared INTEGER DEFAULT 0');
    }

    return $pdo;
}

function redirect_with_message(string $path, string $status, string $message): void
{
    header('Location: ' . $path . '?status=' . rawurlencode($status) . '&message=' . rawurlencode($message));
    exit;
}