<?php
declare(strict_types=1);

session_start();

require __DIR__ . '/db.php';

if (!isset($_SESSION['user'])) {
    http_response_code(401);
    echo json_encode(['error' => 'ログインが必要です']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_pdo();
$email  = $_SESSION['user']['email'];

// ユーザーID取得
$stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$stmt->execute([':email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    echo json_encode(['error' => 'ユーザーが見つかりません']);
    exit;
}

$userId = $user['id'];

// GET: ランキング取得（星の内容も結合して返す）
if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare(
            'SELECT fr.rank, fr.quote_id, fr.is_shared,
                    q.quote, q.author, q.source, q.emotion
             FROM favorite_rankings fr
             JOIN quotes q ON q.id = fr.quote_id
             WHERE fr.user_id = :user_id AND fr.is_shared = 0

             UNION ALL

             SELECT fr.rank, fr.quote_id, fr.is_shared,
                    ss.quote, ss.author, ss.source, ss.emotion
             FROM favorite_rankings fr
             JOIN shared_stars ss ON ss.id = fr.quote_id
             WHERE fr.user_id = :user_id AND fr.is_shared = 1

             ORDER BY rank ASC'
        );
        $stmt->execute([':user_id' => $userId]);
        echo json_encode(['rankings' => $stmt->fetchAll()]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => '取得に失敗しました']);
    }
    exit;
}

// PUT: ランキングを一括保存
// body: { "rankings": [ {"rank":1, "quote_id":10}, {"rank":2, "quote_id":5}, ... ] }
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $items = $input['rankings'] ?? [];

    if (!is_array($items)) {
        http_response_code(400);
        echo json_encode(['error' => '不正なデータです']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // 既存のランキングを全削除してから入れ直す
        $del = $pdo->prepare('DELETE FROM favorite_rankings WHERE user_id = :user_id');
        $del->execute([':user_id' => $userId]);

        $now = date('c');
        $ins = $pdo->prepare(
            'INSERT INTO favorite_rankings (user_id, quote_id, is_shared, rank, updated_at)
             VALUES (:user_id, :quote_id, :is_shared, :rank, :updated_at)'
        );

        $seenRanks = [];
        $seenKeys  = [];  // "0-10" のように is_shared と id を組み合わせて重複判定

        foreach ($items as $item) {
            $rank     = (int)($item['rank'] ?? 0);
            $quoteId  = (int)($item['quote_id'] ?? 0);
            $isShared = !empty($item['is_shared']) ? 1 : 0;

            // 1〜5位のみ許可
            if ($rank < 1 || $rank > 5 || $quoteId <= 0) {
                continue;
            }
            $key = $isShared . '-' . $quoteId;
            // 同じ順位・同じ星の重複は無視
            if (in_array($rank, $seenRanks, true) || in_array($key, $seenKeys, true)) {
                continue;
            }

            // その星が本当に自分のものかチェック（テーブルを使い分ける）
            if ($isShared) {
                $chk = $pdo->prepare('SELECT id FROM shared_stars WHERE id = :id AND user_id = :user_id LIMIT 1');
            } else {
                $chk = $pdo->prepare('SELECT id FROM quotes WHERE id = :id AND user_id = :user_id LIMIT 1');
            }
            $chk->execute([':id' => $quoteId, ':user_id' => $userId]);
            if (!$chk->fetch()) {
                continue;
            }

            $ins->execute([
                ':user_id'    => $userId,
                ':quote_id'   => $quoteId,
                ':is_shared'  => $isShared,
                ':rank'       => $rank,
                ':updated_at' => $now,
            ]);

            $seenRanks[] = $rank;
            $seenKeys[]  = $key;
        }

        $pdo->commit();
        echo json_encode(['message' => '五つの星を保存しました']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['error' => '保存に失敗しました']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'メソッドが許可されていません']);
