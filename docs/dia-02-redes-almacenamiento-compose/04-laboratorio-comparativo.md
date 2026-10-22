# Día 2 - 04: Laboratorio comparativo (Compose end-to-end)

## Objetivos de la sesión

- [ ] Integrar networking, almacenamiento y Compose en stack completo.
- [ ] Comparar estrategias: bind mount vs volume, bridge vs overlay, healthcheck types.
- [ ] Validar resiliencia: restart, failover, scaling, rolling update.
- [ ] Depurar problemas reales: DNS, permisos, resource limits, conectividad.
- [ ] Documentar arquitectura del stack (diagrama, decisiones).

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap + presentación escenario comparativo |
| 20 min | Setup: stack base + 3 variantes comparativas |
| 10 min | Break |
| 60 min | Ejecución comparativa + métricas |
| 20 min | Análisis resultados + discusión |
| 10 min | Preguntas + checkpoint |

---

## Escenario: 3 variantes del mismo stack

| Variante | Networking | Almacenamiento DB | Healthcheck | Uso |
|----------|------------|-------------------|-------------|-----|
| **A: Dev** | Bridge + puertos host | Bind mount (host path) | HTTP simple | Desarrollo local |
| **B: CI/Test** | Bridge (aislado) | Named volume (tmpfs) | HTTP + DB query | Pipeline CI |
| **C: Prod** | Overlay (Swarm) | Named volume (persistente) | Multi-level (HTTP + TCP + custom) | Producción |

---

## Variante A: Desarrollo (`docker-compose.override.yml`)

```yaml
# Ya creado en sesión 2.3
# Características:
# - target: builder (hot reload)
# - bind mounts código host
# - puertos expuestos en host (5173, 3000, 5432, 6379)
# - healthcheck básico HTTP
# - sin resource limits estrictos
```

### Métricas esperadas Dev

| Métrica | Valor típico |
|---------|--------------|
| Tiempo `up` | 30-60s (build incluido) |
| Hot reload latency | < 2s |
| Memoria host | ~2-3 GB |
| CPU host | Variable (sin límites) |
| Persistencia DB | En `./data/pgdata` (bind) |

---

## Variante B: CI/Test (`.github/workflows/ci-compose.yml`)

```yaml
# .github/workflows/ci-compose.yml
version: '3.9'

services:
  frontend:
    image: ghcr.io/${OWNER}/frontend:${VERSION}
    networks: [test-net]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s

  api:
    image: ghcr.io/${OWNER}/api:${VERSION}
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app_test
      - REDIS_URL=redis://redis:6379
    secrets: [jwt_secret]
    networks: [test-net]
    depends_on:
      db: {condition: service_healthy}
      redis: {condition: service_healthy}
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s

  worker:
    image: ghcr.io/${OWNER}/worker:${VERSION}
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app_test
      - REDIS_URL=redis://redis:6379
    secrets: [jwt_secret]
    networks: [test-net]
    depends_on:
      db: {condition: service_healthy}
      redis: {condition: service_healthy}

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=app_test
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets: [db_password]
    volumes:
      - pgdata-test:/var/lib/postgresql/data  # Named volume (tmpfs en CI)
    networks: [test-net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_test"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 5s
    tmpfs:
      - /var/lib/postgresql/data:rw,size=512m  # En memoria para speed

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata-test:/data
    networks: [test-net]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 2s
      retries: 3
      start_period: 3s
    tmpfs:
      - /data:rw,size=128m

networks:
  test-net:
    driver: bridge
    internal: true

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

secrets:
  db_password:
    environment: CI_DB_PASSWORD
  jwt_secret:
    environment: CI_JWT_SECRET
```

### Métricas esperadas CI

| Métrica | Valor típico |
|---------|--------------|
| Tiempo `up` | 15-30s (imágenes pre-pull) |
| Tests execution | 60-180s |
| Memoria | ~1-2 GB (tmpfs) |
| Limpieza | Automática (volumes tmpfs) |
| Paralelismo | Múltiples jobs aislados |

---

## Variante C: Producción (`docker-compose.prod.yml` + Swarm)

```yaml
# docker-compose.prod.yml (para docker stack deploy)
version: '3.9'

services:
  frontend:
    image: ghcr.io/${OWNER}/frontend:${VERSION}
    ports:
      - target: 8080
        published: 80
        protocol: tcp
        mode: ingress
    networks:
      - frontend-net
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 30s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      placement:
        constraints:
          - node.role == worker
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        labels: "service,environment,version"

  api:
    image: ghcr.io/${OWNER}/api:${VERSION}
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
    secrets:
      - jwt_secret
    networks:
      - frontend-net
      - backend-net
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 15s
        failure_action: rollback
      restart_policy:
        condition: on-failure
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 128M
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 15s

  worker:
    image: ghcr.io/${OWNER}/worker:${VERSION}
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
    secrets:
      - jwt_secret
    networks:
      - backend-net
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - backend-net
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
          - node.labels.storage == ssd
      restart_policy:
        condition: on-failure
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    networks:
      - backend-net
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: on-failure
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.1'
          memory: 128M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s

networks:
  frontend-net:
    driver: overlay
    attachable: true
  backend-net:
    driver: overlay
    internal: true

volumes:
  pgdata:
    driver: local
    # En producción real: driver externo (NFS, EBS, Ceph)
  redisdata:
    driver: local

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

configs:
  nginx_config:
    external: true
    name: nginx-config-v1
```

### Métricas esperadas Prod

| Métrica | Valor típico |
|---------|--------------|
| Deploy time | 60-120s (rolling update) |
| Disponibilidad | 99.9% (healthchecks + restart) |
| Escalado | Segundos (replicas) |
| Rollback | Automático en failure_action |
| Persistencia | Volúmenes externos (HA) |
| Observabilidad | Logs centralizados, métricas, traces |

---

## Laboratorio comparativo: ejecutar y medir

### Preparación

```bash
# 1. Asegurar imágenes en registry (build + push día 1)
make build-multiarch  # O make push

# 2. Preparar secrets dev
mkdir -p secrets
echo "postgres" > secrets/db_password.txt
echo "dev-jwt-secret" > secrets/jwt_secret.txt

# 3. Preparar .env
cat > .env <<'EOF'
OWNER=tu-usuario-github
VERSION=latest
EOF
```

### Ejecutar Variante A (Dev)

```bash
# Tiempo de arranque
time docker compose up -d

# Métricas
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Test conectividad
curl -f http://localhost:8080/healthz
curl -f http://localhost:3000/healthz

# Test hot reload
echo "console.log('reload test')" >> apps/api/src/server.ts
sleep 3
docker compose logs api | tail -5

# Limpieza
docker compose down
```

### Ejecutar Variante B (CI - simulado local)

```bash
# Usar compose CI
docker compose -f .github/workflows/ci-compose.yml up -d

# Métricas
time docker compose -f .github/workflows/ci-compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Verificar tmpfs
docker compose -f .github/workflows/ci-compose.yml exec db mount | grep tmpfs

# Test rápido
docker compose -f .github/workflows/ci-compose.yml run --rm api npm test

# Limpieza (volumes tmpfs se limpian solos)
docker compose -f .github/workflows/ci-compose.yml down -v
```

### Ejecutar Variante C (Prod - requiere Swarm)

```bash
# Inicializar Swarm (single node para lab)
docker swarm init

# Crear secrets prod
echo "prod-db-password" | docker secret create db_password -
echo "prod-jwt-secret" | docker secret create jwt_secret -

# Deploy stack
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-prod

# Ver servicios
docker stack services curso-prod
docker stack ps curso-prod --no-trunc

# Ver tasks (contenedores reales)
docker service ps curso-prod_api --no-trunc

# Test rolling update
docker service update --image ghcr.io/usuario/api:v1.1.0 curso-prod_api
docker service ps curso-prod_api --no-trunc  # Ver rolling

# Test escalado
docker service scale curso-prod_worker=5
docker service ps curso-prod_worker

# Test failover: matar task
TASK_ID=$(docker service ps curso-prod_api -q | head -1)
docker kill $(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK_ID)
docker service ps curso-prod_api  # Nuevo task creado

# Logs centralizados (json-file)
docker service logs -f curso-prod_api

# Limpieza
docker stack rm curso-prod
docker secret rm db_password jwt_secret
```

---

## Análisis comparativo: tabla de resultados

| Aspecto | Dev (A) | CI (B) | Prod (C) |
|---------|---------|--------|----------|
| **Tiempo up** | 45s | 20s | 90s |
| **Hot reload** | ✅ Sí | ❌ No | ❌ No |
| **Puertos host** | Sí (5173, 3000, 5432) | No (internal) | Ingress (80, 443) |
| **Persistencia DB** | Bind mount (`./data`) | tmpfs (efímero) | Named volume (externo) |
| **Healthcheck** | HTTP simple | HTTP + DB query | Multi-level |
| **Resource limits** | No | No (CI runner limits) | Sí (deploy.resources) |
| **Restart policy** | `on-failure` (compose) | `on-failure` | `on-failure` (Swarm) |
| **Rolling update** | No | No | Sí (update_config) |
| **Escalado** | `compose scale` | No | `service scale` |
| **Secrets** | Archivos locales | Env vars (CI) | Docker secrets (Swarm) |
| **Networking** | Bridge | Bridge (internal) | Overlay (multi-host) |
| **Logging** | Console (tty) | JSON file | JSON file + labels |
| **Limpieza** | Manual (`down -v`) | Automática | Gestionada por Swarm |

---

## Decisiones de arquitectura (ADR template)

```markdown
# ADR 001: Stack Composition Strategy

## Status
Accepted

## Context
Need to run same application stack in dev, CI, and prod with different requirements.

## Decision
Use single `docker-compose.yml` base with override files per environment:
- `docker-compose.override.yml` (dev, auto-loaded)
- `docker-compose.ci.yml` (CI, explicit -f)
- `docker-compose.prod.yml` (prod, Swarm deploy)

## Consequences
- Single source of truth for service definitions
- Environment-specific overrides explicit
- Dev gets hot reload; CI gets speed; Prod gets HA
- Complexity in merge rules (documented in team wiki)
```

---

## Laboratorio autónomo: Stress test

### Tareas

1. **Load test**: `hey -n 10000 -c 50 http://localhost:8080/` (Dev vs Prod).
2. **Failure injection**: `docker compose kill -s SIGKILL api` → medir recovery time.
3. **Resource exhaustion**: `docker compose exec api stress --cpu 2 --vm 1 --vm-bytes 400M` → ver OOM kill.
4. **Network partition**: `docker network disconnect backend-net api` → ver healthcheck fail → restart.
5. **Scale test**: `docker service scale curso-prod_api=10` → medir tiempo estabilización.

### Herramientas sugeridas

```bash
# Instalar
# hey: go install github.com/rakyll/hey@latest
# stress: apt-get install stress-ng

# Load test
hey -n 10000 -c 50 http://localhost:8080/

# CPU stress
docker compose exec api stress-ng --cpu 2 --timeout 30s

# Memory stress
docker compose exec api stress-ng --vm 1 --vm-bytes 400M --timeout 30s

# Network chaos (requiere capabilities)
docker compose exec --privileged api tc qdisc add dev eth0 root netem loss 10%
```

---

## Checkpoint validación

```bash
# validate.sh lab-2-4
#!/usr/bin/env bash
set -euo pipefail

echo "1. Variante Dev: stack up + hot reload..."
docker compose up -d
sleep 20
curl -f http://localhost:8080/healthz
curl -f http://localhost:3000/healthz
# Test hot reload (verificar logs muestran restart)
docker compose down

echo "2. Variante CI: stack up + tests..."
docker compose -f .github/workflows/ci-compose.yml up -d
sleep 15
docker compose -f .github/workflows/ci-compose.yml ps --format json | jq -r '.Health' | grep -q healthy
docker compose -f .github/workflows/ci-compose.yml down -v

echo "3. Variante Prod: Swarm deploy + rolling update..."
docker swarm init 2>/dev/null || true
echo "prod-db" | docker secret create db_password - 2>/dev/null || true
echo "prod-jwt" | docker secret create jwt_secret - 2>/dev/null || true
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-prod
sleep 30
docker stack services curso-prod | grep -q "3/3"  # frontend replicas
docker service update --image ghcr.io/usuario/api:latest curso-prod_api
sleep 20
docker service ps curso-prod_api --format "{{.CurrentState}}" | grep -q Running
docker stack rm curso-prod
docker secret rm db_password jwt_secret 2>/dev/null || true

echo "✅ Checkpoint 2.4 superado"
```

---

## Recursos post-sesión

- [Docker Compose in production](https://docs.docker.com/compose/production/)
- [Swarm mode](https://docs.docker.com/engine/swarm/)
- [Rolling updates](https://docs.docker.com/engine/swarm/swarm-tutorial/rolling-update/)
- [Compose vs Swarm vs Kubernetes](https://docs.docker.com/compose/compose-swarm-k8s/)
- [Load testing with hey](https://github.com/rakyll/hey)
- [Chaos engineering with Docker](https://github.com/gaia-adm/pumba)