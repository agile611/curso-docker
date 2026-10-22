# docker-compose.yml (Base Production-Ready)

```yaml
version: '3.9'

# =============================================================================
# TaskFlow - Docker Compose Base
# =============================================================================
# Uso: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
#      docker compose -f docker-compose.yml -f docker-compose.override.yml up -d (dev)

services:
  # ---------------------------------------------------------------------------
  # FRONTEND
  # ---------------------------------------------------------------------------
  frontend:
    build:
      context: ./apps/frontend
      dockerfile: Dockerfile
      target: runtime
      args:
        APP_VERSION: ${VERSION:-latest}
        NODE_VERSION: ${NODE_VERSION:-20}
    image: ${REGISTRY:-ghcr.io}/${OWNER:-local}/frontend:${VERSION:-latest}
    pull_policy: missing
    ports:
      - "8080:8080"
    networks:
      - frontend-net
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # API
  # ---------------------------------------------------------------------------
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: runtime
      args:
        APP_VERSION: ${VERSION:-latest}
        NODE_VERSION: ${NODE_VERSION:-20}
    image: ${REGISTRY:-ghcr.io}/${OWNER:-local}/api:${VERSION:-latest}
    pull_policy: missing
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
    secrets:
      - jwt_secret
    networks:
      - frontend-net
      - backend-net
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 15s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # WORKER
  # ---------------------------------------------------------------------------
  worker:
    build:
      context: ./apps/worker
      dockerfile: Dockerfile
      target: runtime
      args:
        APP_VERSION: ${VERSION:-latest}
        PYTHON_VERSION: ${PYTHON_VERSION:-3.12}
    image: ${REGISTRY:-ghcr.io}/${OWNER:-local}/worker:${VERSION:-latest}
    pull_policy: missing
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
    secrets:
      - jwt_secret
    networks:
      - backend-net
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # DATABASE (PostgreSQL)
  # ---------------------------------------------------------------------------
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=taskflow
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./apps/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - backend-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d taskflow"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.2'
          memory: 256M
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 5
        window: 120s
      placement:
        constraints:
          - node.role == manager
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # REDIS
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    networks:
      - backend-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
        reservations:
          cpus: '0.05'
          memory: 64M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      placement:
        constraints:
          - node.role == manager
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment,version"

# ---------------------------------------------------------------------------
# NETWORKS
# ---------------------------------------------------------------------------
networks:
  frontend-net:
    driver: overlay
    attachable: true
    ipam:
      driver: default
      config:
        - subnet: 172.28.0.0/16
  backend-net:
    driver: overlay
    internal: true
    ipam:
      driver: default
      config:
        - subnet: 172.29.0.0/16

# ---------------------------------------------------------------------------
# VOLUMES
# ---------------------------------------------------------------------------
volumes:
  pgdata:
    driver: local
  redisdata:
    driver: local

# ---------------------------------------------------------------------------
# SECRETS
# ---------------------------------------------------------------------------
secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

# ---------------------------------------------------------------------------
# CONFIGS
# ---------------------------------------------------------------------------
configs:
  nginx_config:
    external: true
    name: nginx-config-v1
```

## Variables de entorno requeridas (`.env.example`)

```bash
# Registry
REGISTRY=ghcr.io
OWNER=tu-usuario-o-org

# Versión
VERSION=latest

# Versiones base images
NODE_VERSION=20
PYTHON_VERSION=3.12

# Secrets (crear con: echo "valor" | docker secret create nombre -)
# db_password
# jwt_secret
```

## Uso

```bash
# Desarrollo (con override automático)
docker compose up -d

# Producción (Swarm)
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml taskflow

# Solo base (testing)
docker compose -f docker-compose.yml up -d

# Ver configuración resuelta
docker compose config
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

## Validación

```bash
# 1. Sintaxis
docker compose config >/dev/null

# 2. Servicios definidos
docker compose config --services | grep -E "^(frontend|api|worker|db|redis)$"

# 3. Healthchecks en todos
for s in frontend api worker db redis; do
  docker compose config | grep -A 20 "^  $s:" | grep -q "healthcheck:" || exit 1
done

# 4. Networks
docker compose config | grep -q "frontend-net"
docker compose config | grep -q "backend-net"
docker compose config | grep -q "internal: true"

# 5. Volumes
docker compose config | grep -q "pgdata:"
docker compose config | grep -q "redisdata:"

# 6. Secrets
docker compose config | grep -q "db_password:"
docker compose config | grep -q "jwt_secret:"

# 7. Resource limits
for s in frontend api worker db redis; do
  docker compose config | grep -A 30 "^  $s:" | grep -q "limits:" || exit 1
done
```