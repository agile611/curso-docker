# Día 2 - 03: Roles, tono y formatos (Compose avanzado)

## Objetivos de la sesión

- [ ] Escribir `docker-compose.yml` production-ready con todas las secciones.
- [ ] Dominar override files: merge rules, extends, profiles.
- [ ] Configurar healthchecks, resource limits, restart policies, deploy.
- [ ] Usar secrets, configs, environment variables correctamente.
- [ ] Depurar compose: `config`, `ps`, `logs`, `exec`, `top`.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap almacenamiento + preguntas Compose |
| 30 min | Teoría: spec completo, merge rules, extends, profiles |
| 20 min | Demo: `docker compose config`, override merge, profiles |
| 10 min | Break |
| 50 min | Laboratorio guiado: compose.yml base + override + prod |
| 20 min | Laboratorio autónomo: perfil de testing, scaling, debugging |
| 10 min | Preguntas + checkpoint |

---

## Docker Compose Spec: estructura completa

```yaml
version: '3.9'  # Opcional en v2, pero documenta compatibilidad

# 1. Services (obligatorio)
services:
  servicio:
    # Build
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
      args:
        APP_VERSION: ${VERSION:-dev}
      cache_from:
        - ghcr.io/owner/servicio:latest
      labels:
        - "org.opencontainers.image.source=..."
    # Image (si no build)
    image: ghcr.io/owner/servicio:${VERSION:-latest}
    # Pull policy
    pull_policy: always  # always | missing | never | build

    # Runtime
    command: ["node", "server.js"]
    entrypoint: ["docker-entrypoint.sh"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    env_file:
      - .env
      - .env.prod
    working_dir: /app
    user: "1001:1001"

    # Networking
    ports:
      - "3000:3000"
      - "9229:9229"  # debug
    expose:
      - "3000"
    networks:
      frontend-net:
        aliases:
          - api.internal
      backend-net:
    dns:
      - 1.1.1.1
      - 8.8.8.8
    dns_search:
      - example.com
    extra_hosts:
      - "legacy.host:192.168.1.100"

    # Storage
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./config:/etc/app:ro
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=100m
      - /var/run:rw,size=10m

    # Health & Lifecycle
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 15s
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: on-failure  # no | always | on-failure | unless-stopped
    stop_grace_period: 30s
    stop_signal: SIGTERM

    # Resources
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 128M
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 30s
        max_failure_ratio: 0.1
      rollback_config:
        parallelism: 1
        delay: 5s
        failure_action: pause
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      placement:
        constraints:
          - node.role == worker
        preferences:
          - spread: node.labels.zone
      labels:
        - "com.example.description=API Service"

    # Secrets & Configs
    secrets:
      - source: jwt_secret
        target: /run/secrets/jwt_secret
        mode: 0400
    configs:
      - source: nginx_config
        target: /etc/nginx/conf.d/default.conf
        mode: 0444

    # Logging
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        labels: "service,environment"
      # O syslog, journald, gelf, fluentd, awslogs, gcplogs, splunk

    # Security
    cap_add:
      - NET_BIND_SERVICE
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
      - apparmor:docker-default
    read_only: true
    privileged: false
    pid: host  # host | service:name | none
    ipc: shareable  # shareable | host | none
    cgroupns: host  # host | private

    # GPU / Devices
    devices:
      - "/dev/nvidia0:/dev/nvidia0"
    device_cgroup_rules:
      - 'c 195:* rmw'

    # Profiles (carga condicional)
    profiles:
      - debug
      - monitoring

    # Extends (herencia de servicio)
    extends:
      file: docker-compose.base.yml
      service: base-service

# 2. Networks
networks:
  frontend-net:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: br-frontend
    ipam:
      driver: default
      config:
        - subnet: 172.28.0.0/16
  backend-net:
    driver: bridge
    internal: true  # Sin salida a internet
    ipam:
      config:
        - subnet: 172.29.0.0/16

# 3. Volumes
volumes:
  pgdata:
    driver: local
    driver_opts:
      type: none
      device: /mnt/data/pgdata
      o: bind
  redisdata:
    driver: local
  # Volumen externo (creado fuera)
  external-data:
    external: true
    name: mi-volumen-existente

# 4. Secrets
secrets:
  db_password:
    file: ./secrets/db_password.txt  # Dev
    # external: true  # Prod
  jwt_secret:
    external: true

# 5. Configs
configs:
  nginx_config:
    file: ./apps/frontend/nginx.conf
  app_config:
    external: true
    name: app-config-v1

# 6. Service extensions (para extends)
# x-base-service: &base-service
#   image: alpine
#   logging:
#     driver: json-file
#     options:
#       max-size: "10m"
```

---

## Merge Rules: override files

### Orden de carga

```bash
# 1. docker-compose.yml (base)
# 2. docker-compose.override.yml (auto si existe)
# 3. -f docker-compose.prod.yml (explícito)
# 4. -f docker-compose.staging.yml (explícito)
```

### Reglas de merge

| Sección | Comportamiento |
|---------|----------------|
| `services.<name>` | **Merge profundo**: combina maps, concatena arrays (ports, volumes, env), override scalars |
| `networks`, `volumes`, `secrets`, `configs` | Merge por clave (override gana) |
| `build.args`, `environment`, `labels` | Merge (override gana en claves duplicadas) |
| `ports`, `volumes`, `devices`, `tmpfs`, `cap_add`, `cap_drop` | **Concatena** (no override) |
| `depends_on` | Merge (condiciones se combinan) |
| `deploy` | Merge profundo (replicas, resources, etc.) |

### Ejemplo merge

```yaml
# base.yml
services:
  api:
    image: mi-api:1.0
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - data:/data

# override.yml
services:
  api:
    image: mi-api:dev  # Override scalar
    ports:
      - "3001:3000"    # Concatena: ahora 2 puertos
    environment:
      - DEBUG=1        # Concatena: NODE_ENV + DEBUG
    volumes:
      - ./code:/app    # Concatena: data + ./code
```

### Evitar concatenación no deseada

```yaml
# Usar "reset" con array vacío + nuevo valor
services:
  api:
    ports: []  # Reset
    - "3001:3000"
    volumes: []  # Reset
    - ./code:/app
```

---

## Extends: herencia de servicios

### `docker-compose.base.yml`

```yaml
services:
  base-service:
    image: alpine:3.20
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          memory: 256M
    security_opt:
      - no-new-privileges:true
    read_only: true
```

### `docker-compose.yml`

```yaml
services:
  api:
    extends:
      file: docker-compose.base.yml
      service: base-service
    image: ghcr.io/owner/api:latest
    ports:
      - "3000:3000"
    # Hereda: logging, resources, security_opt, read_only
    # Override: image, ports
```

---

## Profiles: carga condicional

```yaml
services:
  frontend:
    profiles: ["frontend", "all"]

  api:
    profiles: ["backend", "all"]

  worker:
    profiles: ["backend", "async", "all"]

  db:
    profiles: ["backend", "data", "all"]

  redis:
    profiles: ["backend", "data", "all"]

  prometheus:
    profiles: ["monitoring", "all"]

  grafana:
    profiles: ["monitoring", "all"]

  test-runner:
    profiles: ["test", "ci"]
    build:
      context: .
      dockerfile: Dockerfile.test
    command: npm test
    depends_on:
      - api
      - db
```

### Uso

```bash
# Solo backend
docker compose --profile backend up -d

# Backend + monitoring
docker compose --profile backend --profile monitoring up -d

# Todo (explícito)
docker compose --profile all up -d

# Solo tests (CI)
docker compose --profile test run --rm test-runner
```

---

## Healthchecks avanzados

### Tipos de test

```yaml
healthcheck:
  # Comando shell (string)
  test: "curl -f http://localhost:3000/healthz || exit 1"

  # Array exec (recomendado, sin shell)
  test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]

  # CMD-SHELL (explícito shell)
  test: ["CMD-SHELL", "pg_isready -U postgres -d app"]

  # NONE (deshabilitar heredado)
  test: ["NONE"]
```

### Parámetros

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
  interval: 30s        # Cada cuánto (default: 30s)
  timeout: 3s          # Timeout comando (default: 30s)
  retries: 3           # Fallos consecutivos → unhealthy (default: 3)
  start_period: 15s    # Gracia inicial (default: 0s)
  start_interval: 5s   # Intervalo durante start_period (default: 5s) - Compose v2.24+
```

### Dependencias condicionales

```yaml
depends_on:
  db:
    condition: service_healthy      # Espera healthy
  redis:
    condition: service_started      # Espera running (no healthcheck)
  migration:
    condition: service_completed_successfully  # Espera exit 0 (one-shot)
```

---

## Resource Limits: deploy.resources

### Límites (hard) vs Reservas (soft)

```yaml
deploy:
  resources:
    limits:
      cpus: '1.5'      # 1.5 CPU cores (CF quota)
      memory: 1G       # Hard limit (OOM kill si excede)
      pids: 100        # Max procesos (kernel pids cgroup)
    reservations:
      cpus: '0.5'      # Garantizado (CPU shares)
      memory: 256M     # Garantizado (memory reservation)
```

### Unidades

| Recurso | Unidades | Ejemplo |
|---------|----------|---------|
| `cpus` | Decimal (cores) | `'0.5'`, `'1'`, `'2.5'` |
| `memory` | Bytes (k/m/g) | `'256M'`, `'1G'`, `'512000000'` |
| `pids` | Entero | `100` |

### Swarm vs Standalone

| Contexto | `deploy.resources` | `cpus`/`memory` (legacy) |
|----------|-------------------|--------------------------|
| `docker compose up` (standalone) | ❌ Ignorado | ✅ Funciona |
| `docker stack deploy` (Swarm) | ✅ Funciona | ⚠️ Deprecated |
| Kubernetes (Kompose) | ✅ Convertido a resources | ❌ |

**Recomendación**: Usar `deploy.resources` siempre; para standalone añadir `cpus`/`memory` a nivel service como fallback.

```yaml
services:
  api:
    # Fallback standalone
    cpus: '1.0'
    memory: 512M
    # Swarm
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
```

---

## Secrets y Configs en detalle

### Secrets: archivos sensibles

```yaml
secrets:
  # Desde archivo (dev)
  db_password:
    file: ./secrets/db_password.txt

  # Externo (prod - creado con docker secret create)
  jwt_secret:
    external: true
    name: prod-jwt-secret  # Nombre en Swarm

  # Desde variable de entorno (solo dev, NO prod)
  api_key:
    environment: API_KEY
```

```yaml
services:
  api:
    secrets:
      - source: db_password
        target: /run/secrets/db_password  # Path en contenedor
        mode: 0400                        # Permisos
        uid: '1001'                       # Owner (opcional)
        gid: '1001'
```

```bash
# En contenedor: leer secret
cat /run/secrets/db_password
# En código Node.js:
const password = fs.readFileSync('/run/secrets/db_password', 'utf8').trim();
```

### Configs: archivos no sensibles

```yaml
configs:
  nginx_config:
    file: ./apps/frontend/nginx.conf
  app_config:
    external: true
    name: app-config-v2
```

```yaml
services:
  frontend:
    configs:
      - source: nginx_config
        target: /etc/nginx/conf.d/default.conf
        mode: 0444
```

---

## Debugging Compose

### `docker compose config`

```bash
# Ver configuración resuelta (merge de todos los -f)
docker compose config

# Solo servicios
docker compose config --services

# Solo volumes
docker compose config --volumes

# Validar sin resolver variables
docker compose config --no-interpolate

# Output JSON
docker compose config --format json | jq
```

### `docker compose ps`

```bash
# Estado simple
docker compose ps

# Formato JSON
docker compose ps --format json | jq

# Con health status
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Solo running
docker compose ps --filter status=running
```

### `docker compose logs`

```bash
# Seguir todos
docker compose logs -f

# Servicio específico
docker compose logs -f api

# Últimas 100 líneas + timestamps
docker compose logs --tail=100 -t api

# Desde timestamp
docker compose logs --since="2024-01-15T10:00:00Z" api
```

### `docker compose exec` / `run`

```bash
# Ejecutar en contenedor running
docker compose exec api sh
docker compose exec -u root api sh  # Como root

# One-off command (nuevo contenedor)
docker compose run --rm api npm test
docker compose run --rm -e NODE_ENV=test api npm test
```

### `docker compose top`

```bash
# Procesos en contenedores
docker compose top
```

---

## Laboratorio guiado: Compose completo

### 1. Crear `docker-compose.yml` base

```bash
cat > docker-compose.yml <<'EOF'
version: '3.9'

services:
  frontend:
    build:
      context: ./apps/frontend
      target: runtime
    image: ghcr.io/${OWNER:-local}/frontend:${VERSION:-latest}
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
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  api:
    build:
      context: ./apps/api
      target: runtime
    image: ghcr.io/${OWNER:-local}/api:${VERSION:-latest}
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
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

  worker:
    build:
      context: ./apps/worker
      target: runtime
    image: ghcr.io/${OWNER:-local}/worker:${VERSION:-latest}
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
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
      - ./apps/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - backend-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
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

networks:
  frontend-net:
    driver: bridge
  backend-net:
    driver: bridge
    internal: true

volumes:
  pgdata:
    driver: local
  redisdata:
    driver: local

secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
EOF
```

### 2. Crear `docker-compose.override.yml`

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  frontend:
    build:
      target: builder
    command: npm run dev
    ports:
      - "5173:5173"
    volumes:
      - ./apps/frontend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true

  api:
    build:
      target: builder
    command: npm run dev
    volumes:
      - ./apps/api:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    ports:
      - "3000:3000"
      - "9229:9229"

  worker:
    build:
      target: builder
    command: python -m watchfiles --filter "*.py" "celery -A worker.tasks worker --loglevel=debug"
    volumes:
      - ./apps/worker:/app

  db:
    ports:
      - "5432:5432"

  redis:
    ports:
      - "6379:6379"
EOF
```

### 3. Crear `docker-compose.prod.yml`

```bash
cat > docker-compose.prod.yml <<'EOF'
services:
  frontend:
    image: ghcr.io/${OWNER}/frontend:${VERSION}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      placement:
        constraints:
          - node.role == worker

  api:
    image: ghcr.io/${OWNER}/api:${VERSION}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 15s
      restart_policy:
        condition: on-failure

  worker:
    image: ghcr.io/${OWNER}/worker:${VERSION}
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  db:
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      restart_policy:
        condition: on-failure

  redis:
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
EOF
```

### 4. Validar y probar

```bash
# Ver config resuelto desarrollo
docker compose config

# Ver config resuelto producción
docker compose -f docker-compose.yml -f docker-compose.prod.yml config

# Levantar desarrollo
docker compose up -d

# Ver estado
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

# Logs
docker compose logs -f api

# Test endpoints
curl -f http://localhost:8080/healthz
curl -f http://localhost:3000/healthz

# Escalar
docker compose up -d --scale worker=3
docker compose ps worker

# Bajar
docker compose down
```

---

## Laboratorio autónomo: Perfiles y debugging

### Tareas

1. **Añadir perfil `monitoring`** con Prometheus + Grafana (solo si `--profile monitoring`).
2. **Añadir perfil `test`** con servicio `test-runner` que ejecute tests de integración.
3. **Debug**: usar `docker compose config --format json | jq` para encontrar configuración errónea.
4. **Simular fallo**: matar contenedor `api` → verificar restart policy.
5. **Resource limits**: `docker compose top` + `docker stats` para ver límites aplicados.

### Pistas

```yaml
# En docker-compose.yml añadir:
services:
  prometheus:
    image: prom/prometheus:latest
    profiles: ["monitoring"]
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports:
      - "9090:9090"
    networks:
      - backend-net

  grafana:
    image: grafana/grafana:latest
    profiles: ["monitoring"]
    ports:
      - "3001:3000"
    networks:
      - backend-net

  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.test
    profiles: ["test"]
    command: npm run test:integration
    depends_on:
      api:
        condition: service_healthy
      db:
        condition: service_healthy
    networks:
      - backend-net
```

```bash
# Probar perfiles
docker compose --profile monitoring up -d
docker compose --profile test run --rm test-runner

# Debug config
docker compose config --format json | jq '.services.api.deploy.resources'

# Simular fallo
docker compose kill -s SIGKILL api
docker compose ps api  # Debe reiniciar (restart: on-failure)
```

---

## Checkpoint validación

```bash
# validate.sh lab-2-3
#!/usr/bin/env bash
set -euo pipefail

echo "1. docker-compose.yml válido..."
docker compose config >/dev/null || exit 1

echo "2. 5 servicios definidos..."
SERVICES=$(docker compose config --services)
for s in frontend api worker db redis; do
  echo "$SERVICES" | grep -q "^$s$" || exit 1
done

echo "3. Healthchecks en todos..."
for s in frontend api worker db redis; do
  docker compose config | grep -A 20 "^  $s:" | grep -q "healthcheck:" || exit 1
done

echo "4. Networks: frontend-net (external) + backend-net (internal)..."
docker compose config | grep -A 5 "frontend-net:" | grep -q "driver: bridge"
docker compose config | grep -A 5 "backend-net:" | grep -q "internal: true"

echo "5. Volumes named: pgdata, redisdata..."
docker compose config | grep -q "pgdata:"
docker compose config | grep -q "redisdata:"

echo "6. Secrets: db_password, jwt_secret..."
docker compose config | grep -q "db_password:"
docker compose config | grep -q "jwt_secret:"

echo "7. Resource limits en deploy..."
for s in frontend api worker db redis; do
  docker compose config | grep -A 30 "^  $s:" | grep -q "limits:" || exit 1
done

echo "8. Override.yml merge correcto (dev ports)..."
docker compose config | grep -A 10 "frontend:" | grep -q "5173:5173"

echo "9. Prod.yml merge correcto (replicas)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -A 10 "frontend:" | grep -q "replicas: 3"

echo "10. Stack up y healthy..."
docker compose up -d
sleep 30
for s in frontend api worker db redis; do
  HEALTH=$(docker compose ps --format json $s | jq -r '.Health // "none"')
  [[ "$HEALTH" == "healthy" || "$HEALTH" == "running" ]] || exit 1
done

echo "✅ Checkpoint 2.3 superado"
```

---

## Recursos post-sesión

- [Compose specification](https://github.com/compose-spec/compose-spec/blob/main/spec.md)
- [Compose file reference](https://docs.docker.com/compose/compose-file/)
- [Override files](https://docs.docker.com/compose/extends/#multiple-compose-files)
- [Profiles](https://docs.docker.com/compose/profiles/)
- [Resource constraints](https://docs.docker.com/compose/compose-file/deploy/#resources)
- [Healthchecks](https://docs.docker.com/compose/compose-file/healthcheck/)
- [Secrets in Compose](https://docs.docker.com/compose/use-secrets/)