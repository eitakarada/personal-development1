<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirect_with_message('../auth/registar.html', 'error', '不正なアクセスです');
}

$username = trim((string)($_POST['username'] ?? ''));
$email = trim(strtolower((string)($_POST['email'] ?? '')));
$password = (string)($_POST['password'] ?? '');

if ($username === '' || $email === '' || $password === '') {
    redirect_with_message('../auth/registar.html', 'error', 'すべての項目を入力してください');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    redirect_with_message('../auth/registar.html', 'error', 'メールアドレスの形式が正しくありません');
}

if (strlen($password) < 6) {
    redirect_with_message('../auth/registar.html', 'error', 'パスワードは6文字以上にしてください');
}

try {
    $pdo = get_pdo();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);

    if ($stmt->fetch()) {
        redirect_with_message('../auth/registar.html', 'error', 'そのメールアドレスは既に登録されています');
    }

    $insert = $pdo->prepare(
        'INSERT INTO users (username, email, password_hash, created_at)
         VALUES (:username, :email, :password_hash, :created_at)'
    );
    $insert->execute([
        ':username' => $username,
        ':email' => $email,
        ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ':created_at' => date('c')
    ]);

    redirect_with_message('../auth/login.html', 'success', '登録に成功しました。ログインしてください');
} catch (Throwable $error) {
    redirect_with_message('../auth/registar.html', 'error', '登録に失敗しました');
}