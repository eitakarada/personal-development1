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

// GET: ユーザーの言葉一覧を取得
if ($method === 'GET') {
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
        
        // 自分の言葉 + 共有された星を統合
        $stmt = $pdo->prepare(
            'SELECT id, quote, author, source, reason, emotion, favorite, is_public, created_at, 
                    0 as is_shared, NULL as original_owner
             FROM quotes 
             WHERE user_id = :user_id
             
             UNION ALL
             
             SELECT ss.id, ss.quote, ss.author, ss.source, 
                    ss.reason, ss.emotion, 
                    ss.favorite as favorite, 
                    0 as is_public, 
                    ss.created_at,
                    1 as is_shared,
                    u.username as original_owner
             FROM shared_stars ss
             JOIN users u ON u.id = ss.original_user_id
             WHERE ss.user_id = :user_id
             
             ORDER BY created_at DESC'
        );
        $stmt->execute([':user_id' => $user['id']]);
        $quotes = $stmt->fetchAll();
        
        echo json_encode(['quotes' => $quotes]);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '取得に失敗しました']);
    }
    exit;
}

// POST: 新しい言葉を登録
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $quote = trim($input['quote'] ?? '');
    $author = trim($input['author'] ?? '');
    $source = trim($input['source'] ?? '');
    $reason = trim($input['reason'] ?? '');
    $emotion = trim($input['emotion'] ?? '');
    
    if ($quote === '') {
        http_response_code(400);
        echo json_encode(['error' => '言葉を入力してください']);
        exit;
    }
    
    if ($emotion === '') {
        http_response_code(400);
        echo json_encode(['error' => '感情を選択してください']);
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
        
        $now = date('c');
        
        // 言葉を登録（新しい星はデフォルトで公開）
        $stmt = $pdo->prepare(
            'INSERT INTO quotes (user_id, quote, author, source, reason, emotion, is_public, created_at, updated_at)
             VALUES (:user_id, :quote, :author, :source, :reason, :emotion, 1, :created_at, :updated_at)'
        );
        $stmt->execute([
            ':user_id' => $user['id'],
            ':quote' => $quote,
            ':author' => $author,
            ':source' => $source,
            ':reason' => $reason,
            ':emotion' => $emotion,
            ':created_at' => $now,
            ':updated_at' => $now
        ]);
        
        $newId = $pdo->lastInsertId();
        
        echo json_encode([
            'message' => '言葉を登録しました',
            'id' => $newId
        ]);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '登録に失敗しました']);
    }
    exit;
}

// PUT: お気に入り切り替え
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $quoteId = (int)($input['id'] ?? 0);
    $favorite = (int)($input['favorite'] ?? 0);
    $isShared = !empty($input['is_shared']);   // フレンドから持ってきた星かどうか
    // 対象テーブル（固定の2択なのでSQLに埋め込んでも安全）
    $table = $isShared ? 'shared_stars' : 'quotes';
    
    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'IDが無効です']);
        exit;
    }
    
    try {
        $pdo = get_pdo();
        $email = $_SESSION['user']['email'];
        
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'ユーザーが見つかりません']);
            exit;
        }
        
        // 自分の夜空にある星かチェック（自分の星 or 持ってきた星）
        $stmt = $pdo->prepare("SELECT id FROM {$table} WHERE id = :id AND user_id = :user_id LIMIT 1");
        $stmt->execute([':id' => $quoteId, ':user_id' => $user['id']]);
        
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => '権限がありません']);
            exit;
        }
        
        // 更新（shared_stars には updated_at 列がないので分ける）
        if ($isShared) {
            $stmt = $pdo->prepare('UPDATE shared_stars SET favorite = :favorite WHERE id = :id');
            $stmt->execute([':favorite' => $favorite, ':id' => $quoteId]);
        } else {
            $stmt = $pdo->prepare(
                'UPDATE quotes SET favorite = :favorite, updated_at = :updated_at WHERE id = :id'
            );
            $stmt->execute([
                ':favorite' => $favorite,
                ':updated_at' => date('c'),
                ':id' => $quoteId
            ]);
        }
        
        echo json_encode(['message' => 'お気に入りを更新しました']);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '更新に失敗しました']);
    }
    exit;
}

// PATCH: 公開/非公開の切り替え or 編集
if ($method === 'PATCH') {
    $input = json_decode(file_get_contents('php://input'), true);
    $quoteId = (int)($input['id'] ?? 0);
    
    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'IDが無効です']);
        exit;
    }

    try {
        $pdo = get_pdo();
        $email = $_SESSION['user']['email'];

        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'ユーザーが見つかりません']);
            exit;
        }

        // 自分の言葉かチェック
        $stmt = $pdo->prepare('SELECT id FROM quotes WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute([':id' => $quoteId, ':user_id' => $user['id']]);

        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => '権限がありません']);
            exit;
        }

        // is_publicがあれば公開設定の切り替え
        if (isset($input['is_public'])) {
            $isPublic = (int)$input['is_public'];
            $stmt = $pdo->prepare(
                'UPDATE quotes SET is_public = :is_public, updated_at = :updated_at WHERE id = :id'
            );
            $stmt->execute([
                ':is_public'  => $isPublic,
                ':updated_at' => date('c'),
                ':id'         => $quoteId,
            ]);
            echo json_encode([
                'message'   => $isPublic ? '星を公開しました' : '星を非公開にしました',
                'is_public' => $isPublic,
            ]);
        }
        // quote/author/source/reason/emotionがあれば編集
        elseif (isset($input['quote']) || isset($input['author']) || isset($input['source']) 
                || isset($input['reason']) || isset($input['emotion'])) {
            
            $updates = [];
            $params  = [':id' => $quoteId, ':updated_at' => date('c')];
            
            if (isset($input['quote'])) {
                $updates[] = 'quote = :quote';
                $params[':quote'] = trim($input['quote']);
            }
            if (isset($input['author'])) {
                $updates[] = 'author = :author';
                $params[':author'] = trim($input['author']);
            }
            if (isset($input['source'])) {
                $updates[] = 'source = :source';
                $params[':source'] = trim($input['source']);
            }
            if (isset($input['reason'])) {
                $updates[] = 'reason = :reason';
                $params[':reason'] = trim($input['reason']);
            }
            if (isset($input['emotion'])) {
                $updates[] = 'emotion = :emotion';
                $params[':emotion'] = trim($input['emotion']);
            }
            
            if (empty($updates)) {
                http_response_code(400);
                echo json_encode(['error' => '更新内容がありません']);
                exit;
            }
            
            $updates[] = 'updated_at = :updated_at';
            $sql = 'UPDATE quotes SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            
            echo json_encode(['message' => '星を更新しました']);
        }
        else {
            http_response_code(400);
            echo json_encode(['error' => '更新内容が指定されていません']);
        }
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '更新に失敗しました']);
    }
    exit;
}

// DELETE: 星を削除
if ($method === 'DELETE') {
    $quoteId = (int)($_GET['id'] ?? 0);
    
    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'IDが無効です']);
        exit;
    }
    
    try {
        $pdo = get_pdo();
        $email = $_SESSION['user']['email'];
        
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(404);
            echo json_encode(['error' => 'ユーザーが見つかりません']);
            exit;
        }
        
        // 自分の言葉かチェック
        $stmt = $pdo->prepare('SELECT id FROM quotes WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute([':id' => $quoteId, ':user_id' => $user['id']]);
        
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => '権限がありません']);
            exit;
        }
        
        // 振り返りメモも削除
        $pdo->prepare('DELETE FROM reflections WHERE quote_id = :id')->execute([':id' => $quoteId]);
        
        // 星を削除
        $pdo->prepare('DELETE FROM quotes WHERE id = :id')->execute([':id' => $quoteId]);
        
        echo json_encode(['message' => '星を削除しました']);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '削除に失敗しました']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'メソッドが許可されていません']);
