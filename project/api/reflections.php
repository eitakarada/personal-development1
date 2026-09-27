<?php
declare(strict_types=1);

session_start();

require __DIR__ . '/db.php';

// ログインチェック
if (!isset($_SESSION['user'])) {
    http_response_code(401);
    echo json_encode(['error' => 'ログインが必要です']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// GET: 特定のquoteに対する振り返り一覧を取得
if ($method === 'GET') {
    $quoteId  = (int)($_GET['quote_id'] ?? 0);
    $isShared = $_GET['is_shared'] === '1';
    $ownerId  = (int)($_GET['owner_id'] ?? 0);
    
    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'quote_idが無効です']);
        exit;
    }
    
    try {
        $pdo = get_pdo();
        $email = $_SESSION['user']['email'];
        
        // ユーザーIDを取得
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'ユーザーが見つかりません']);
            exit;
        }
        
        if ($ownerId > 0 && $ownerId !== (int)$user['id']) {
            $friendStmt = $pdo->prepare(
                'SELECT id FROM friends
                 WHERE ((user_id = :uid AND friend_id = :oid)
                    OR (user_id = :oid AND friend_id = :uid))
                   AND status = 'accepted'
                 LIMIT 1'
            );
            $friendStmt->execute([':uid' => $user['id'], ':oid' => $ownerId]);
            if (!$friendStmt->fetch()) {
                http_response_code(403);
                echo json_encode(['error' => 'フレンドではないため閲覧できません']);
                exit;
            }
        } else {
            $ownerId = (int)$user['id'];
        }

        // 自分のメモ、またはフレンドの元星に残されたメモを取得
        $stmt = $pdo->prepare(
            'SELECT r.id, r.memo, r.emotion, r.created_at, u.username as author_name
             FROM reflections r
             JOIN users u ON u.id = r.user_id
             WHERE r.quote_id = :quote_id AND r.user_id = :owner_id AND r.is_shared = :is_shared
             ORDER BY r.created_at DESC'
        );
        $stmt->execute([
            ':quote_id'  => $quoteId,
            ':owner_id'  => $ownerId,
            ':is_shared' => $isShared ? 1 : 0
        ]);
        $reflections = $stmt->fetchAll();
        
        echo json_encode(['reflections' => $reflections]);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '取得に失敗しました']);
    }
    exit;
}

// POST: 振り返りメモを追加
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $quoteId    = (int)($input['quote_id'] ?? 0);
    $isShared   = (bool)($input['is_shared'] ?? false);
    $memo       = trim($input['memo'] ?? '');
    $emotion    = trim($input['emotion'] ?? '');
    
    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'quote_idが無効です']);
        exit;
    }
    
    if ($memo === '') {
        http_response_code(400);
        echo json_encode(['error' => 'メモを入力してください']);
        exit;
    }
    
    try {
        $pdo = get_pdo();
        $email = $_SESSION['user']['email'];
        
        // ユーザーIDを取得
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'ユーザーが見つかりません']);
            exit;
        }
        
        // 自分の星かチェック（quotes または shared_stars）
        if ($isShared) {
            $stmt = $pdo->prepare('SELECT id FROM shared_stars WHERE id = :id AND user_id = :user_id LIMIT 1');
        } else {
            $stmt = $pdo->prepare('SELECT id FROM quotes WHERE id = :id AND user_id = :user_id LIMIT 1');
        }
        $stmt->execute([':id' => $quoteId, ':user_id' => $user['id']]);
        
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => '権限がありません']);
            exit;
        }
        
        $now = date('c');
        
        // 振り返りメモを登録
        // shared_starsの場合はquote_idにshared_stars.idを使い、is_sharedフラグを立てる
        $stmt = $pdo->prepare(
            'INSERT INTO reflections (quote_id, user_id, memo, emotion, is_shared, created_at)
             VALUES (:quote_id, :user_id, :memo, :emotion, :is_shared, :created_at)'
        );
        $stmt->execute([
            ':quote_id'   => $quoteId,
            ':user_id'    => $user['id'],
            ':memo'       => $memo,
            ':emotion'    => $emotion,
            ':is_shared'  => $isShared ? 1 : 0,
            ':created_at' => $now
        ]);
        
        $newId = $pdo->lastInsertId();
        
        echo json_encode([
            'message' => '振り返りメモを追加しました',
            'id' => $newId
        ]);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '登録に失敗しました']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'メソッドが許可されていません']);
