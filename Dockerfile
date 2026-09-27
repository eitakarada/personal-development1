FROM php:8.2-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlite3-dev libpq-dev \
    && docker-php-ext-install pdo_sqlite pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 8000

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8000} -t project"]