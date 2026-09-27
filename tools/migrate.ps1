$ErrorActionPreference = 'Stop'

$password = Read-Host 'Supabaseの新しいデータベースパスワードを入力' -AsSecureString
$passwordText = [System.Net.NetworkCredential]::new('', $password).Password
$encodedPassword = [Uri]::EscapeDataString($passwordText)
$databaseUrl = "postgresql://postgres.jwqiwcxoxycjdqglorfi:$encodedPassword@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

try {
    docker run --rm -v "${PWD}:/app" cieloemo-render-check php /app/tools/migrate_sqlite_to_postgres.php $databaseUrl
} finally {
    Remove-Variable password, passwordText, encodedPassword, databaseUrl -ErrorAction SilentlyContinue
}