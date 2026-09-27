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
$pdo = get_pdo();
$email = $_SESSION['user']['email'];

// 自分のユーザーID取得
$stmt = $pdo->prepare('SELECT id, username FROM users WHERE email = :email LIMIT 1');
$stmt->execute([':email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    echo json_encode(['error' => 'ユーザーが見つかりません']);
    exit;
}

$userId = $user['id'];

// GET: フレンド一覧・申請一覧・ユーザー検索
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'list';
    
    try {
        // フレンド一覧
        if ($action === 'list') {
            $stmt = $pdo->prepare(
                'SELECT u.id, u.username, u.email, f.created_at
                 FROM friends f
                 JOIN users u ON (
                    CASE 
                        WHEN f.user_id = :user_id THEN u.id = f.friend_id
                        ELSE u.id = f.user_id
                    END
                 )
                 WHERE (f.user_id = :user_id OR f.friend_id = :user_id)
                   AND f.status = 'accepted'
                 ORDER BY f.created_at DESC'
            );
            $stmt->execute([':user_id' => $userId]);
            echo json_encode(['friends' => $stmt->fetchAll()]);
        }
        
        // 受信した申請一覧
        elseif ($action === 'requests') {
            $stmt = $pdo->prepare(
                'SELECT u.id, u.username, u.email, f.id as request_id, f.created_at
                 FROM friends f
                 JOIN users u ON u.id = f.user_id
                 WHERE f.friend_id = :user_id AND f.status = 'pending'
                 ORDER BY f.created_at DESC'
            );
            $stmt->execute([':user_id' => $userId]);
            echo json_encode(['requests' => $stmt->fetchAll()]);
        }
        
        // 送信した申請一覧
        elseif ($action === 'sent') {
            $stmt = $pdo->prepare(
                'SELECT u.id, u.username, u.email, f.created_at
                 FROM friends f
                 JOIN users u ON u.id = f.friend_id
                 WHERE f.user_id = :user_id AND f.status = 'pending'
                 ORDER BY f.created_at DESC'
            );
            $stmt->execute([':user_id' => $userId]);
            echo json_encode(['sent' => $stmt->fetchAll()]);
        }
        
        // ユーザー検索（メールアドレス）
        elseif ($action === 'search') {
            $query = trim($_GET['q'] ?? '');
            if ($query === '') {
                echo json_encode(['users' => []]);
                exit;
            }
            
            $stmt = $pdo->prepare(
                'SELECT id, username, email 
                 FROM users 
                 WHERE email LIKE :query AND id != :user_id
                 LIMIT 10'
            );
            $stmt->execute([':query' => '%' . $query . '%', ':user_id' => $userId]);
            echo json_encode(['users' => $stmt->fetchAll()]);
        }
        
        else {
            http_response_code(400);
            echo json_encode(['error' => '無効なアクションです']);
        }
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '取得に失敗しました']);
    }
    exit;
}

// POST: フレンド申請
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $friendId = (int)($input['friend_id'] ?? 0);
    
    if ($friendId <= 0 || $friendId === $userId) {
        http_response_code(400);
        echo json_encode(['error' => '無効なユーザーIDです']);
        exit;
    }
    
    try {
        // 既存の関係をチェック
        $stmt = $pdo->prepare(
            'SELECT id, status FROM friends 
             WHERE (user_id = :uid AND friend_id = :fid) 
                OR (user_id = :fid AND friend_id = :uid)
             LIMIT 1'
        );
        $stmt->execute([':uid' => $userId, ':fid' => $friendId]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            if ($existing['status'] === 'accepted') {
                http_response_code(400);
                echo json_encode(['error' => '既にフレンドです']);
                exit;
            } else {
                http_response_code(400);
                echo json_encode(['error' => '申請済みです']);
                exit;
            }
        }
        
        // 申請作成
        $stmt = $pdo->prepare(
            'INSERT INTO friends (user_id, friend_id, status, created_at)
             VALUES (:user_id, :friend_id, 'pending', :created_at)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':friend_id' => $friendId,
            ':created_at' => date('c')
        ]);
        
        echo json_encode(['message' => 'フレンド申請を送信しました']);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '申請に失敗しました']);
    }
    exit;
}

// PUT: フレンド申請を承認
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $requestId = (int)($input['request_id'] ?? 0);
    
    if ($requestId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => '無効なリクエストIDです']);
        exit;
    }
    
    try {
        // 自分宛ての申請かチェック
        $stmt = $pdo->prepare(
            'SELECT id FROM friends 
             WHERE id = :id AND friend_id = :user_id AND status = 'pending'
             LIMIT 1'
        );
        $stmt->execute([':id' => $requestId, ':user_id' => $userId]);
        
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => '権限がありません']);
            exit;
        }
        
        // 承認
        $stmt = $pdo->prepare("UPDATE friends SET status = 'accepted' WHERE id = :id");
        $stmt->execute([':id' => $requestId]);
        
        echo json_encode(['message' => 'フレンド申請を承認しました']);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '承認に失敗しました']);
    }
    exit;
}

// DELETE: フレンド削除・申請拒否
if ($method === 'DELETE') {
    $friendId = (int)($_GET['friend_id'] ?? 0);
    
    if ($friendId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => '無効なユーザーIDです']);
        exit;
    }
    
    try {
        $stmt = $pdo->prepare(
            'DELETE FROM friends 
             WHERE (user_id = :uid AND friend_id = :fid) 
                OR (user_id = :fid AND friend_id = :uid)'
        );
        $stmt->execute([':uid' => $userId, ':fid' => $friendId]);
        
        echo json_encode(['message' => 'フレンドを削除しました']);
    } catch (Throwable $error) {
        http_response_code(500);
        echo json_encode(['error' => '削除に失敗しました']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'メソッドが許可されていません']);
