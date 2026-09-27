<?php
declare(strict_types=1);

session_start();

require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirect_with_message('../auth/login.html', 'error', '不正なアクセスです');
}

$email = trim(strtolower((string)($_POST['email'] ?? '')));
$password = (string)($_POST['password'] ?? '');

if ($email === '' || $password === '') {
    redirect_with_message('../auth/login.html', 'error', 'メールアドレスとパスワードを入力してください');
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('SELECT username, email, password_hash FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user) {
        redirect_with_message('../auth/login.html', 'error', 'ユーザーが見つかりません');
    }

    if (!password_verify($password, $user['password_hash'])) {
        redirect_with_message('../auth/login.html', 'error', 'パスワードが違います');
    }

    $_SESSION['user'] = [
        'username' => $user['username'],
        'email' => $user['email']
    ];

    redirect_with_message('../home/index.html', 'success', 'ログインに成功しました');
} catch (Throwable $error) {
    redirect_with_message('../auth/login.html', 'error', 'ログインに失敗しました');
}