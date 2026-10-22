# docker-compose.override.yml (Desarrollo con Hot Reload)

```yaml
# =============================================================================
# TaskFlow - Docker Compose Override (Desarrollo)
# =============================================================================
# Se carga AUTOMÁTICAMENTE por docker compose (sin -f)
# Uso: docker compose up -d

services:
  # ---------------------------------------------------------------------------
  # FRONTEND - Hot reload con Vite
  # ---------------------------------------------------------------------------
  frontend:
    build:
      target: builder  # Usar stage builder con dev tools
    command: npm run dev  # Vite dev server con HMR
    ports:
      - "5173:5173"  # Vite dev server
      - "8080:8080"  # Nginx preview (opcional)
    volumes:
      - ./apps/frontend:/app
      - /app/node_modules  # Anonymous volume protege node_modules
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true  # Para Docker en Mac/Windows
      - VITE_API_URL=http://localhost:3000
    # Override healthcheck para dev (más permisivo)
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:5173/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s

  # ---------------------------------------------------------------------------
  # API - Hot reload con nodemon/tsx
  # ---------------------------------------------------------------------------
  api:
    build:
      target: builder
    command: npm run dev  # tsx watch / nodemon
    volumes:
      - ./apps/api:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-jwt-secret-change-in-production
    ports:
      - "3000:3000"   # API
      - "9229:9229"   # Debug port (Node.js inspector)
    # Override healthcheck para dev
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s

  # ---------------------------------------------------------------------------
  # WORKER - Hot reload con watchfiles
  # ---------------------------------------------------------------------------
  worker:
    build:
      target: builder
    command: python -m watchfiles --filter "*.py" "celery -A worker.tasks worker --loglevel=debug --concurrency=2"
    volumes:
      - ./apps/worker:/app
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-jwt-secret-change-in-production
    # Worker no necesita healthcheck HTTP en dev (usa celery ping)
    healthcheck:
      test: ["CMD", "python", "-c", "import os; import redis; r=redis.from_url(os.getenv('REDIS_URL','redis://redis:6379')); r.ping()"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  # ---------------------------------------------------------------------------
  # DATABASE - Puerto expuesto para herramientas locales
  # ---------------------------------------------------------------------------
  db:
    ports:
      - "5432:5432"  # Acceso desde host: psql -h localhost -U postgres
    # Override: sin healthcheck estricto en dev
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d taskflow"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 5s

  # ---------------------------------------------------------------------------
  # REDIS - Puerto expuesto para herramientas locales
  # ---------------------------------------------------------------------------
  redis:
    ports:
      - "6379:6379"  # Acceso desde host: redis-cli
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 2s
      retries: 3
      start_period: 3s

# ---------------------------------------------------------------------------
# NETWORKS (override: mantener overlay pero sin internal en dev)
# ---------------------------------------------------------------------------
networks:
  frontend-net:
    driver: bridge  # En dev usamos bridge simple
  backend-net:
    driver: bridge
    internal: false  # En dev permitimos acceso externo para debugging

# ---------------------------------------------------------------------------
# VOLUMES (override: usar tmpfs para velocidad en dev)
# ---------------------------------------------------------------------------
volumes:
  pgdata:
    driver: local
    driver_opts:
      type: tmpfs
      o: size=512m
  redisdata:
    driver: local
    driver_opts:
      type: tmpfs
      o: size=128m

# ---------------------------------------------------------------------------
# SECRETS (override: usar archivos locales en dev)
# ---------------------------------------------------------------------------
secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt
```

## Archivos de secrets para desarrollo (`secrets/`)

```bash
# Crear directorio
mkdir -p secrets

# Password DB (dev)
echo "postgres" > secrets/db_password.txt

# JWT Secret (dev - 32 chars mínimo)
echo "dev-jwt-secret-change-in-production-min-32-chars" > secrets/jwt_secret.txt

# Gitignore (IMPORTANTE: no commitear secrets reales)
echo "secrets/" >> .gitignore
echo "secrets/*.txt" >> .gitignore
```

## Uso

```bash
# Desarrollo (carga override automáticamente)
docker compose up -d

# Ver logs
docker compose logs -f api

# Ver estado
docker compose ps

# Ejecutar comandos en contenedor
docker compose exec api npm test
docker compose exec worker python -m pytest
docker compose exec db psql -U postgres -d taskflow

# Rebuild específico
docker compose build api
docker compose up -d --no-deps api

# Parar
docker compose down

# Parar + limpiar volúmenes (tmpfs se limpian solos)
docker compose down -v
```

## Diferencias clave: Base vs Override

| Aspecto | Base (`docker-compose.yml`) | Override (`docker-compose.override.yml`) |
|---------|----------------------------|------------------------------------------|
| **Target build** | `runtime` (optimizado) | `builder` (con dev tools) |
| **Comando** | Producción (`node dist/server.js`) | Dev (`npm run dev`, `watchfiles`) |
| **Volúmenes** | Solo named volumes | Bind mounts código + `/app/node_modules` anonimo |
| **Puertos** | Solo internos (overlay) | Expuestos en host (5173, 3000, 5432, 6379) |
| **Secrets** | `external: true` (Swarm/K8s) | Archivos locales `./secrets/` |
| **Networks** | Overlay + `internal: true` | Bridge simple, `internal: false` |
| **Volumes** | Named persistentes | `tmpfs` (en memoria, rápido, efímero) |
| **Healthchecks** | Estrictos (30s interval) | Permisivos (10s interval) |
| **Debug ports** | No | Sí (9229 Node.js inspector) |

## Merge rules (cómo se combinan)

```yaml
# Reglas de merge automático:
# - Maps (environment, labels, deploy): MERGE (override gana en claves duplicadas)
# - Arrays (ports, volumes, depends_on): CONCATENACIÓN
# - Scalars (command, image, restart): OVERRIDE (override gana)

# Ejemplo: ports
# Base:  - "8080:8080"
# Override: - "5173:5173"
# Resultado: AMBOS puertos expuestos

# Para RESET un array (no concatenar):
services:
  frontend:
    ports: []  # Reset array
    - "5173:5173"  # Solo este puerto
```

## Validación override

```bash
# Ver configuración mergeada (dev)
docker compose config

# Ver solo servicios
docker compose config --services

# Ver configuración resuelta para un servicio
docker compose config | grep -A 50 "^  frontend:"

# Validar que no hay conflictos
docker compose config --quiet
```