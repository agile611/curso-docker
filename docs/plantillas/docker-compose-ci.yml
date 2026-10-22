# docker-compose.ci.yml (CI Testing con tmpfs)

```yaml
# =============================================================================
# TaskFlow - Docker Compose CI (Testing)
# =============================================================================
# Uso: docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
#      En GitHub Actions: docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d

version: '3.9'

services:
  # ---------------------------------------------------------------------------
  # FRONTEND
  # ---------------------------------------------------------------------------
  frontend:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/frontend:${VERSION:-latest}
    pull_policy: always
    networks:
      - test-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  # ---------------------------------------------------------------------------
  # API
  # ---------------------------------------------------------------------------
  api:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/api:${VERSION:-latest}
    pull_policy: always
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow_test
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=ci-test-secret
    networks:
      - test-net
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

  # ---------------------------------------------------------------------------
  # WORKER
  # ---------------------------------------------------------------------------
  worker:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/worker:${VERSION:-latest}
    pull_policy: always
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow_test
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=ci-test-secret
    networks:
      - test-net
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

  # ---------------------------------------------------------------------------
  # DATABASE (PostgreSQL con tmpfs para velocidad)
  # ---------------------------------------------------------------------------
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=taskflow_test
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - pgdata-test:/var/lib/postgresql/data
    networks:
      - test-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d taskflow_test"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 5s
    tmpfs:
      - /var/lib/postgresql/data:rw,size=512m  # En memoria para velocidad
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  # ---------------------------------------------------------------------------
  # REDIS (con tmpfs)
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata-test:/data
    networks:
      - test-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 2s
      retries: 3
      start_period: 3s
    tmpfs:
      - /data:rw,size=128m
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M

# ---------------------------------------------------------------------------
# NETWORKS (Aislada para CI)
# ---------------------------------------------------------------------------
networks:
  test-net:
    driver: bridge
    internal: true  # Sin salida a internet

# ---------------------------------------------------------------------------
# VOLUMES (tmpfs para velocidad y limpieza automática)
# ---------------------------------------------------------------------------
volumes:
  pgdata-test:
    driver: local
    driver_opts:
      type: tmpfs
      o: size=512m
  redisdata-test:
    driver: local
    driver_opts:
      type: tmpfs
      o: size=128m
```

## Uso en GitHub Actions

```yaml
# .github/workflows/ci.yml (extracto)
jobs:
  test:
    name: Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Pull images
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml pull

      - name: Start CI stack
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d

      - name: Wait for healthy
        run: |
          timeout 120 bash -c '
            while ! docker compose -f docker-compose.yml -f docker-compose.ci.yml ps --format json | jq -r ".Health" | grep -qv healthy; do
              sleep 2
            done
          '

      - name: Run integration tests
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm api npm run test:integration

      - name: Run E2E tests
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm frontend npm run test:e2e

      - name: Cleanup
        if: always()
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v
```

## Características clave CI

| Característica | Implementación | Beneficio |
|----------------|----------------|-----------|
| **Red aislada** | `internal: true` | Sin acceso externo, tests deterministas |
| **Volúmenes tmpfs** | `driver_opts: type=tmpfs` | Velocidad extrema, limpieza automática |
| **Pull policy always** | `pull_policy: always` | Siempre usa imagen fresca del registry |
| **Healthchecks rápidos** | Interval 5-10s | Feedback rápido |
| **Recursos limitados** | `deploy.resources.limits` | Evita OOM en runners compartidos |
| **Limpieza automática** | `down -v` + tmpfs | Sin residuos entre runs |

## Variables de entorno CI

```bash
# En GitHub Actions (repository secrets/variables)
REGISTRY=ghcr.io
OWNER=${{ github.repository_owner }}
VERSION=${{ github.sha }}  # O tag semver
```

## Diferencias: CI vs Dev vs Prod

| Aspecto | Dev (`override.yml`) | CI (`ci.yml`) | Prod (`prod.yml`) |
|---------|---------------------|---------------|-------------------|
| **Red** | Bridge, puertos host | Bridge internal, sin puertos | Overlay, ingress |
| **Volúmenes** | Bind mounts código | tmpfs (efímero) | Named persistentes |
| **Secrets** | Archivos locales | Env vars / secrets CI | Docker secrets Swarm |
| **Healthchecks** | Permisivos (10s) | Rápidos (5-10s) | Estrictos (30s) |
| **Recursos** | Sin límites | Limitados (runner) | Completos + reservations |
| **Replicas** | 1 | 1 | 2-3 (HPA en K8s) |
| **Puertos host** | Sí (5173, 3000, 5432) | No | Ingress (80/443) |
| **Limpieza** | Manual | Automática (`down -v`) | Gestionada por Swarm |

## GitHub Actions completo (`.github/workflows/ci-compose.yml`)

```yaml
name: CI - Compose Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}
  VERSION: ${{ github.sha }}

jobs:
  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Pull images
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml pull

      - name: Start CI stack
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d

      - name: Wait for services healthy
        run: |
          for i in {1..60}; do
            HEALTHY=$(docker compose -f docker-compose.yml -f docker-compose.ci.yml ps --format json | jq -r '.Health' | sort -u)
            if [[ "$HEALTHY" == "healthy" ]]; then
              echo "All services healthy"
              exit 0
            fi
            sleep 2
          done
          echo "Timeout waiting for healthy services"
          docker compose -f docker-compose.yml -f docker-compose.ci.yml ps
          exit 1

      - name: Run API integration tests
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm api npm run test:integration

      - name: Run Worker tests
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm worker pytest

      - name: Run Frontend E2E tests
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm frontend npm run test:e2e

      - name: Cleanup
        if: always()
        run: |
          docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: |
            apps/api/coverage/
            apps/worker/coverage/
            apps/frontend/coverage/
```

## Validación CI

```bash
# Local test del compose CI
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d
docker compose -f docker-compose.yml -f docker-compose.ci.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Verificar tmpfs
docker compose -f docker-compose.yml -f docker-compose.ci.yml exec db mount | grep tmpfs

# Test rápido
docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm api npm test

# Limpieza
docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v
```