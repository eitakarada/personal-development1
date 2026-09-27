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

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$stmt->execute([':email' => $email]);
$me = $stmt->fetch();

if (!$me) {
    http_response_code(404);
    echo json_encode(['error' => 'ユーザーが見つかりません']);
    exit;
}

$myId = $me['id'];

// GET: フレンドの夜空（公開星）を取得
if ($method === 'GET') {
    $action   = $_GET['action'] ?? 'sky';
    $targetId = (int)($_GET['user_id'] ?? 0);

    try {
        // フレンドかどうかチェック
        if ($targetId > 0 && $targetId !== $myId) {
                        $stmt = $pdo->prepare(
                                "SELECT id FROM friends 
                 WHERE ((user_id = :uid AND friend_id = :tid) 
                    OR  (user_id = :tid AND friend_id = :uid))
                   AND status = 'accepted'
                                 LIMIT 1"
            );
            $stmt->execute([':uid' => $myId, ':tid' => $targetId]);
            if (!$stmt->fetch()) {
                http_response_code(403);
                echo json_encode(['error' => 'フレンドではないため閲覧できません']);
                exit;
            }
        }

        // フレンドの夜空（本人の公開星 + フレンドから受け取った星）
        if ($action === 'sky' && $targetId > 0) {
            $stmt = $pdo->prepare(
                'SELECT q.id, q.quote, q.author, q.source, q.reason, q.emotion, q.created_at,
                    u.username, 0 as is_shared, NULL as original_quote_id,
                    NULL as original_owner
                 FROM quotes q
                 JOIN users u ON u.id = q.user_id
                 WHERE q.user_id = :target_id AND q.is_public = 1

                   UNION ALL

                   SELECT ss.id, ss.quote, ss.author, ss.source, ss.reason, ss.emotion, ss.created_at,
                       u.username, 1 as is_shared, ss.original_quote_id,
                       original_user.username as original_owner
                   FROM shared_stars ss
                   JOIN users u ON u.id = ss.user_id
                   JOIN users original_user ON original_user.id = ss.original_user_id
                   WHERE ss.user_id = :target_id_shared

                 ORDER BY 7 DESC'
            );
            $stmt->execute([':target_id' => $targetId, ':target_id_shared' => $targetId]);
            $stars = $stmt->fetchAll();

            // 自分がすでにコピー済みの原本IDセットを取得
            $stmt2 = $pdo->prepare(
                'SELECT original_quote_id FROM shared_stars WHERE user_id = :uid'
            );
            $stmt2->execute([':uid' => $myId]);
            $copiedIds = array_column($stmt2->fetchAll(), 'original_quote_id');

            foreach ($stars as &$s) {
                $sourceId = $s['is_shared'] == 1 ? $s['original_quote_id'] : $s['id'];
                $s['already_copied'] = in_array((int)$sourceId, array_map('intval', $copiedIds));
            }
            unset($s);

            echo json_encode(['stars' => $stars]);
        }

        // フレンドの「あなたを構成する五つの星」（共有星も含む）
        elseif ($action === 'ranking' && $targetId > 0) {
            $stmt = $pdo->prepare(
                'SELECT fr.rank, fr.quote_id, fr.is_shared,
                    q.quote, q.author, q.source, q.emotion, q.reason,
                    NULL as original_owner
                 FROM favorite_rankings fr
                 JOIN quotes q ON q.id = fr.quote_id
                 WHERE fr.user_id = :target_id AND fr.is_shared = 0 AND q.is_public = 1

                   UNION ALL

                   SELECT fr.rank, fr.quote_id, fr.is_shared,
                       ss.quote, ss.author, ss.source, ss.emotion, ss.reason,
                       original_user.username as original_owner
                   FROM favorite_rankings fr
                   JOIN shared_stars ss ON ss.id = fr.quote_id
                   JOIN users original_user ON original_user.id = ss.original_user_id
                   WHERE fr.user_id = :target_id_shared AND fr.is_shared = 1

                 ORDER BY 1 ASC'
            );
            $stmt->execute([':target_id' => $targetId, ':target_id_shared' => $targetId]);
            echo json_encode(['rankings' => $stmt->fetchAll()]);
        }

        // 自分の夜空に取り込んだ共有星
        elseif ($action === 'my_shared') {
            $stmt = $pdo->prepare(
                'SELECT ss.id, ss.quote, ss.author, ss.source, ss.emotion, ss.created_at,
                        ss.original_quote_id, u.username as original_username
                 FROM shared_stars ss
                 JOIN users u ON u.id = ss.original_user_id
                 WHERE ss.user_id = :uid
                 ORDER BY ss.created_at DESC'
            );
            $stmt->execute([':uid' => $myId]);
            echo json_encode(['shared_stars' => $stmt->fetchAll()]);
        }

        // 自分の星をフレンドが受け取った記録
        elseif ($action === 'received_copies') {
            $stmt = $pdo->prepare(
                "SELECT ss.id, ss.quote, ss.author, ss.source, ss.emotion, ss.created_at,
                        ss.original_quote_id, copier.username as copier_username
                 FROM shared_stars ss
                 JOIN users copier ON copier.id = ss.user_id
                 JOIN friends f ON (
                    (f.user_id = :uid AND f.friend_id = ss.user_id)
                    OR (f.user_id = ss.user_id AND f.friend_id = :uid)
                 ) AND f.status = 'accepted'
                 WHERE ss.original_user_id = :uid
                 ORDER BY ss.created_at DESC"
            );
            $stmt->execute([':uid' => $myId]);
            echo json_encode(['received_copies' => $stmt->fetchAll()]);
        }

        // 星に付いているコメント一覧
        elseif ($action === 'comments') {
            $quoteId  = (int)($_GET['quote_id'] ?? 0);
            $isShared = ($_GET['is_shared'] ?? '0') === '1';
            $ownerId  = (int)($_GET['owner_id'] ?? 0);
            // owner_id を省略したら「自分の星」とみなす
            if ($ownerId <= 0) {
                $ownerId = (int)$myId;
            }

            if ($quoteId <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'パラメータが不正です']);
                exit;
            }

            // 自分自身の星、またはフレンドの星のみコメント一覧を見られる
            if ($ownerId !== $myId) {
                                $stmt = $pdo->prepare(
                                        "SELECT id FROM friends 
                     WHERE ((user_id = :uid AND friend_id = :oid)
                        OR  (user_id = :oid AND friend_id = :uid))
                       AND status = 'accepted'
                                         LIMIT 1"
                );
                $stmt->execute([':uid' => $myId, ':oid' => $ownerId]);
                if (!$stmt->fetch()) {
                    http_response_code(403);
                    echo json_encode(['error' => 'フレンドではないため閲覧できません']);
                    exit;
                }
            }

            $stmt = $pdo->prepare(
                'SELECT c.id, c.comment, c.created_at, u.username as commenter_name
                 FROM friend_star_comments c
                 JOIN users u ON u.id = c.commenter_id
                 WHERE c.star_owner_id = :owner_id AND c.quote_id = :quote_id AND c.is_shared = :is_shared
                 ORDER BY c.created_at ASC'
            );
            $stmt->execute([
                ':owner_id'  => $ownerId,
                ':quote_id'  => $quoteId,
                ':is_shared' => $isShared ? 1 : 0,
            ]);
            echo json_encode(['comments' => $stmt->fetchAll()]);
        }

        else {
            http_response_code(400);
            echo json_encode(['error' => '無効なアクションです']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => '取得に失敗しました']);
    }
    exit;
}

// POST: フレンドの星を自分の夜空にコピー
if ($method === 'POST') {
    $input   = json_decode(file_get_contents('php://input'), true);
    $quoteId = (int)($input['quote_id'] ?? 0);
    $emotion = trim($input['emotion'] ?? '');   // 自分の感情（必須）
    $reason  = trim($input['reason']  ?? '');   // 自分の理由（任意）

    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'quote_idが無効です']);
        exit;
    }

    if ($emotion === '') {
        http_response_code(400);
        echo json_encode(['error' => '感情を選択してください']);
        exit;
    }

    try {
        // 元の星を取得（公開されているか確認）
        $stmt = $pdo->prepare(
            'SELECT id, user_id, quote, author, source, emotion, is_public
             FROM quotes WHERE id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $quoteId]);
        $original = $stmt->fetch();

        if (!$original) {
            http_response_code(404);
            echo json_encode(['error' => '星が見つかりません']);
            exit;
        }

        // 非公開なら拒否
        if (!$original['is_public']) {
            http_response_code(403);
            echo json_encode(['error' => 'この星は非公開です']);
            exit;
        }

        // 自分の星は自分でコピーできない
        if ((int)$original['user_id'] === $myId) {
            http_response_code(400);
            echo json_encode(['error' => '自分の星はコピーできません']);
            exit;
        }

        // フレンドかチェック
                $stmt = $pdo->prepare(
                        "SELECT id FROM friends 
             WHERE ((user_id = :uid AND friend_id = :oid)
                OR  (user_id = :oid AND friend_id = :uid))
               AND status = 'accepted'
                         LIMIT 1"
        );
        $stmt->execute([':uid' => $myId, ':oid' => $original['user_id']]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'フレンドの星のみコピーできます']);
            exit;
        }

        // 既にコピー済みかチェック
        $stmt = $pdo->prepare(
            'SELECT id FROM shared_stars 
             WHERE user_id = :uid AND original_quote_id = :qid LIMIT 1'
        );
        $stmt->execute([':uid' => $myId, ':qid' => $quoteId]);
        if ($stmt->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'すでに自分の夜空にある星です']);
            exit;
        }

        // コピー保存（reason/reflectionは含めない）
        $stmt = $pdo->prepare(
            'INSERT INTO shared_stars
             (user_id, original_quote_id, original_user_id, quote, author, source, emotion, reason, created_at)
             VALUES (:uid, :oqid, :ouid, :quote, :author, :source, :emotion, :reason, :created_at)'
        );
        $stmt->execute([
            ':uid'        => $myId,
            ':oqid'       => $original['id'],
            ':ouid'       => $original['user_id'],
            ':quote'      => $original['quote'],
            ':author'     => $original['author'],
            ':source'     => $original['source'],
            ':emotion'    => $emotion,
            ':reason'     => $reason ?: null,
            ':created_at' => date('c'),
        ]);

        echo json_encode(['message' => 'フレンドの星を夜空に加えました ✨']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'コピーに失敗しました']);
    }
    exit;
}

// PUT: フレンドの星にコメントを残す
if ($method === 'PUT') {
    $input    = json_decode(file_get_contents('php://input'), true);
    $quoteId  = (int)($input['quote_id'] ?? 0);
    $ownerId  = (int)($input['owner_id'] ?? 0);
    $isShared = !empty($input['is_shared']);
    $comment  = trim($input['comment'] ?? '');
    // owner_id を省略したら「自分の星への返信」とみなす
    if ($ownerId <= 0) {
        $ownerId = (int)$myId;
    }

    if ($quoteId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'パラメータが不正です']);
        exit;
    }
    if ($comment === '') {
        http_response_code(400);
        echo json_encode(['error' => 'コメントを入力してください']);
        exit;
    }

    try {
        // 自分の星、またはフレンドの星にのみコメントできる
        if ($ownerId !== $myId) {
                        $stmt = $pdo->prepare(
                                "SELECT id FROM friends 
                 WHERE ((user_id = :uid AND friend_id = :oid)
                    OR  (user_id = :oid AND friend_id = :uid))
                   AND status = 'accepted'
                                 LIMIT 1"
            );
            $stmt->execute([':uid' => $myId, ':oid' => $ownerId]);
            if (!$stmt->fetch()) {
                http_response_code(403);
                echo json_encode(['error' => 'フレンドではないためコメントできません']);
                exit;
            }
        }

        $stmt = $pdo->prepare(
            'INSERT INTO friend_star_comments
             (star_owner_id, quote_id, is_shared, commenter_id, comment, created_at)
             VALUES (:owner_id, :quote_id, :is_shared, :commenter_id, :comment, :created_at)'
        );
        $stmt->execute([
            ':owner_id'     => $ownerId,
            ':quote_id'     => $quoteId,
            ':is_shared'    => $isShared ? 1 : 0,
            ':commenter_id' => $myId,
            ':comment'      => $comment,
            ':created_at'   => date('c'),
        ]);

        echo json_encode(['message' => 'コメントを送りました']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['error' => 'コメントの投稿に失敗しました']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'メソッドが許可されていません']);
