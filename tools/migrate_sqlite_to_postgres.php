<?php
declare(strict_types=1);

if ($argc < 2) {
    fwrite(STDERR, "使い方: php tools/migrate_sqlite_to_postgres.php DATABASE_URL\n");
    exit(1);
}

$sqlitePath = __DIR__ . '/../project/data/auth.sqlite';
$sqlite = new PDO('sqlite:' . $sqlitePath);
$sqlite->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

$database = parse_url($argv[1]);
if ($database === false || empty($database['host']) || empty($database['user']) || empty($database['path'])) {
    throw new RuntimeException('DATABASE_URL が正しくありません');
}

$dsn = 'pgsql:host=' . $database['host']
    . ';port=' . ($database['port'] ?? 5432)
    . ';dbname=' . ltrim($database['path'], '/')
    . ';sslmode=require';
$postgres = new PDO($dsn, rawurldecode($database['user']), rawurldecode($database['pass'] ?? ''));
$postgres->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$tables = [
    'users',
    'quotes',
    'reflections',
    'friends',
    'shared_stars',
    'favorite_rankings',
    'friend_star_comments',
];

$postgres->beginTransaction();
try {
    foreach ($tables as $table) {
        $columns = array_column(
            $sqlite->query('PRAGMA table_info(' . $table . ')')->fetchAll(),
            'name'
        );
        $rows = $sqlite->query('SELECT * FROM ' . $table)->fetchAll();

        if ($rows === []) {
            continue;
        }

        $columnList = implode(', ', array_map(static fn(string $column): string => '"' . $column . '"', $columns));
        $placeholders = implode(', ', array_map(static fn(string $column): string => ':' . $column, $columns));
        $insert = $postgres->prepare(
            'INSERT INTO public."' . $table . '" (' . $columnList . ')
             OVERRIDING SYSTEM VALUE VALUES (' . $placeholders . ')'
        );

        foreach ($rows as $row) {
            $values = [];
            foreach ($columns as $column) {
                $values[':' . $column] = $row[$column];
            }
            $insert->execute($values);
        }
    }

    foreach ($tables as $table) {
        $postgres->exec(
            "SELECT setval(pg_get_serial_sequence('public.\"$table\"', 'id'), "
            . "COALESCE((SELECT MAX(id) FROM public.\"$table\"), 1), true)"
        );
    }

    $postgres->commit();
    echo "移行完了\n";
} catch (Throwable $error) {
    $postgres->rollBack();
    throw $error;
}