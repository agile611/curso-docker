# Día 2 · Redes, almacenamiento y Compose

## Objetivos del día

- [ ] Dominar el modelo de red de Docker: bridge, host, none, overlay, macvlan.
- [ ] Configurar DNS interno, service discovery, conectividad entre contenedores.
- [ ] Gestionar almacenamiento: named volumes, bind mounts, tmpfs, drivers.
- [ ] Escribir `docker-compose.yml` production-ready con override files.
- [ ] Aplicar healthchecks, resource limits, secrets, configs en Compose.
- [ ] Desplegar stack completo (frontend, API, DB, worker, Redis) con un comando.

---

## 2.1 Networking: bridge, host, none, overlay, DNS interno

### Drivers de red nativos

| Driver | Caso de uso | Aislamiento | Multi-host |
|--------|-------------|-------------|------------|
| `bridge` | Default, contenedores en mismo host | Red privada por host | No |
| `host` | Máximo rendimiento, sin NAT | Ninguno (usa red host) | No |
| `none` | Sin red (solo loopback) | Total | No |
| `overlay` | Swarm / Kubernetes (multi-host) | VXLAN encapsulado | **Sí** |
| `macvlan` | IP propia en LAN física | Como host físico | No (requiere config switch) |

### Red bridge (default)

```bash
# Crear red bridge personalizada
docker network create --driver bridge \
  --subnet=172.28.0.0/16 \
  --gateway=172.28.0.1 \
  mi-red

# Conectar contenedores
docker run -d --name api --network mi-red mi-api
docker run -d --name frontend --network mi-red mi-frontend

# DNS interno: nombre de contenedor = hostname resoluble
# frontend → api: http://api:3000
```

### Red host

```bash
# Comparte stack de red del host (Linux only)
docker run -d --network host --name mi-api mi-api
# Accesible en localhost:3000 del host
# Sin aislamiento de puertos - conflicto si hay varios
```

### Red overlay (Swarm)

```bash
# Requiere Swarm mode
docker swarm init
docker network create --driver overlay --attachable mi-overlay

# Contenedores en hosts distintos se ven por DNS
# docker run -d --network mi-overlay --name api mi-api  (host A)
# docker run -d --network mi-overlay --name worker mi-worker  (host B)
# worker resuelve "api" → IP virtual overlay
```

### DNS interno

```
Contenedor en red "mi-red":
  /etc/hosts:
    127.0.0.1   localhost
    172.28.0.3  api.mi-red  api
    172.28.0.4  frontend.mi-red  frontend

  /etc/resolv.conf:
    nameserver 127.0.0.11  (Docker embedded DNS)
    search mi-red
```

- **127.0.0.11**: DNS embebido de Docker (resuelve nombres de contenedores en misma red).
- **Search domain**: nombre de la red → `api` resuelve a `api.mi-red`.

---

## Sesión práctica 2.1: Networking Docker

### Objetivo
Dominar la creación y gestión de redes Docker, service discovery y conectividad entre contenedores.

### Duración: 60 minutos

### Pasos guiados

#### 1. Explorar redes por defecto
```bash
# Listar redes existentes
docker network ls

# Inspeccionar red bridge por defecto
docker network inspect bridge

# Ver contenedores conectados
docker network inspect bridge --format '{{range .Containers}}{{.Name}} {{end}}'
```

#### 2. Crear redes personalizadas
```bash
# Crear red bridge con subnet personalizada
docker network create --driver bridge \
  --subnet=172.28.0.0/16 \
  --gateway=172.28.0.1 \
  --opt com.docker.network.bridge.name=br-mi-red \
  mi-red

# Verificar creación
docker network inspect mi-red
```

#### 3. Conectar contenedores a la red
```bash
# Ejecutar contenedores en la red personalizada
docker run -d --name api --network mi-red \
  -e PORT=3000 \
  ghcr.io/usuario/api:latest

docker run -d --name frontend --network mi-red \
  -e API_URL=http://api:3000 \
  ghcr.io/usuario/frontend:latest

# Verificar conectividad
docker exec frontend ping -c 3 api
docker exec frontend curl -s http://api:3000/healthz
```

#### 3. Service Discovery con DNS interno
```bash
# Ver /etc/hosts dentro del contenedor
docker exec frontend cat /etc/hosts

# Ver /etc/resolv.conf
docker exec frontend cat /etc/resolv.conf

# Probar resolución DNS
docker exec frontend nslookup api
docker exec frontend dig api.mi-red

# Probar conectividad HTTP
docker exec frontend curl -v http://api:3000/healthz
```

#### 4. Red host (solo Linux)
```bash
# Ejecutar con red del host
docker run -d --network host --name mi-api-host ghcr.io/usuario/api:latest

# Verificar acceso directo en localhost
curl http://localhost:3000/healthz

# Verificar puertos en host
ss -tulpn | grep 3000
```

#### 5. Red overlay (requiere Swarm)
```bash
# Inicializar Swarm
docker swarm init

# Crear red overlay attachable
docker network create --driver overlay --attachable mi-overlay

# Desplegar servicios en la red overlay
docker service create --name api-overlay --network mi-overlay ghcr.io/usuario/api:latest
docker service create --name worker-overlay --network mi-overlay ghcr.io/usuario/worker:latest

# Verificar DNS overlay
docker exec $(docker ps -q -f name=worker-overlay) nslookup api-overlay
```

#### 6. Limpieza
```bash
# Eliminar contenedores
docker rm -f api frontend

# Eliminar redes
docker network rm mi-red mi-overlay

# Salir de Swarm
docker swarm leave --force
```

### Ejercicios de práctica

1. **Ejercicio 1**: Crear una red bridge con subnet `10.10.0.0/16` y desplegar 3 contenedores que se comuniquen entre sí
2. **Ejercicio 2**: Configurar un contenedor con IP fija en la red personalizada
3. **Ejercicio 3**: Probar conectividad entre contenedores en redes diferentes (bridge vs host)

### Verificación
```bash
# validate.sh lab-2-1
#!/usr/bin/env bash
set -euo pipefail

echo "Verificando laboratorio 2.1..."

# Verificar red personalizada existe
docker network inspect mi-red >/dev/null 2>&1 || { echo "❌ Red mi-red no existe"; exit 1; }

# Verificar contenedores en la red
docker network inspect mi-red --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "api" || { echo "❌ api no en red"; exit 1; }
docker network inspect mi-red --format '{{range .Containers}}{{.Name}} {{end}}' | grep -q "frontend" || { echo "❌ frontend no en red"; exit 1; }

# Verificar DNS
docker exec frontend nslookup api >/dev/null 2>&1 || { echo "❌ DNS no resuelve"; exit 1; }

# Verificar conectividad HTTP
docker exec frontend curl -sf http://api:3000/healthz >/dev/null || { echo "❌ HTTP falla"; exit 1; }

echo "✅ Laboratorio 2.1 completado correctamente"
```

---

## 2.2 Almacenamiento: volúmenes, bind mounts, tmpfs, drivers
  --opt device=/mnt/data/postgres \
  --opt o=bind \
  pgdata

# O simple (Docker gestiona path)
docker volume create pgdata

# Usar
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:16

# Inspeccionar
docker volume inspect pgdata
# Mountpoint: /var/lib/docker/volumes/pgdata/_data
```

### Bind mounts

```bash
# Desarrollo: código host → contenedor
docker run -d --name api \
  -v $(pwd)/apps/api:/app:ro \
  -v $(pwd)/apps/api/node_modules:/app/node_modules \
  mi-api

# Configuración
docker run -d --name nginx \
  -v /etc/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine

# Certificados
docker run -d --name app \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  mi-app
```

### tmpfs (memoria)

```dockerfile
# En Dockerfile (runtime)
VOLUME ["/tmp", "/var/run", "/var/cache/nginx"]

# En run (override)
docker run -d --name api \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  --tmpfs /var/run:rw,size=10m \
  mi-api
```

### Drivers de volumen

```bash
# Local con opciones (ej. NFS)
docker volume create --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/exports/data \
  nfs-volume

# Plugins externos (ejemplos)
# docker plugin install vieux/sshfs
# docker volume create --driver vieux/sshfs -o sshcmd=user@host:/path sshfs-vol
```

### Backup / Restore volumes

```bash
# Backup
docker run --rm -v pgdata:/data -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-$(date +%F).tar.gz -C /data .

# Restore
docker run --rm -v pgdata:/data -v $(pwd):/backup alpine \
  tar xzf /backup/pgdata-2024-01-15.tar.gz -C /data
```

---

## 2.3 Docker Compose v2: especificación completa

### Estructura `docker-compose.yml`

```yaml
version: '3.9'  # Opcional en v2, pero recomendado para compat

services:
  frontend:
    build:
      context: ./apps/frontend
      dockerfile: Dockerfile
      target: runtime
    image: ghcr.io/${OWNER}/frontend:${VERSION:-latest}
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
      dockerfile: Dockerfile
      target: runtime
    image: ghcr.io/${OWNER}/api:${VERSION:-latest}
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
      dockerfile: Dockerfile
      target: runtime
    image: ghcr.io/${OWNER}/worker:${VERSION:-latest}
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
    internal: true  # Sin acceso externo

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

configs:
  nginx_config:
    file: ./apps/frontend/nginx.conf
```

---

## 2.4 Override files: dev / staging / prod

### `docker-compose.override.yml` (desarrollo - auto-cargado)

```yaml
services:
  frontend:
    build:
      target: builder  # Usar stage builder con hot reload
    command: npm run dev
    ports:
      - "5173:5173"  # Vite dev server
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
      - "9229:9229"  # Debug port

  worker:
    build:
      target: builder
    command: python -m watchfiles --filter "*.py" "celery -A worker.tasks worker --loglevel=debug"
    volumes:
      - ./apps/worker:/app

  db:
    ports:
      - "5432:5432"  # Acceso directo desde host

  redis:
    ports:
      - "6379:6379"
```

### `docker-compose.prod.yml` (producción)

```yaml
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
    image: postgres:16-alpine
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager  # Solo en manager para persistencia local
      restart_policy:
        condition: on-failure

  redis:
    image: redis:7-alpine
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
```

### Uso

```bash
# Desarrollo (carga override.yml automáticamente)
docker compose up -d

# Producción (explícito)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Staging (archivo intermedio)
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d

# Ver configuración resuelta
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

---

## 2.5 Secrets, Configs y Variables de entorno

### Secrets (solo Swarm / Compose v2 con `docker compose up` en Swarm)

```yaml
# En docker-compose.yml
secrets:
  db_password:
    file: ./secrets/db_password.txt  # Para desarrollo local
  jwt_secret:
    external: true  # En producción: creado fuera (docker secret create)

services:
  api:
    secrets:
      - source: jwt_secret
        target: /run/secrets/jwt_secret
        mode: 0400
    environment:
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
```

```bash
# Crear secrets en Swarm
echo "super-secret-jwt" | docker secret create jwt_secret -
echo "super-secret-db" | docker secret create db_password -

# Ver
docker secret ls
docker secret inspect jwt_secret
```

### Configs (archivos de configuración no sensibles)

```yaml
configs:
  nginx_config:
    file: ./apps/frontend/nginx.conf

services:
  frontend:
    configs:
      - source: nginx_config
        target: /etc/nginx/conf.d/default.conf
        mode: 0444
```

### Variables de entorno (`.env` file)

```bash
# .env (no commitear - usar .env.example)
OWNER=mi-usuario
VERSION=v1.2.3
DATABASE_URL=postgresql://postgres:postgres@db:5432/app
REDIS_URL=redis://redis:6379
```

```yaml
# docker-compose.yml
services:
  api:
    env_file:
      - .env
    environment:
      - NODE_ENV=production  # Override específico
```

---

## 2.6 Laboratorio 2.1: Red overlay + volúmenes persistentes

### Objetivo

Crear red overlay, desplegar PostgreSQL con volumen persistente, verificar datos sobreviven a recreate.

### Pasos

```bash
# 1. Inicializar Swarm (single node para lab)
docker swarm init

# 2. Crear red overlay attachable
docker network create --driver overlay --attachable lab-net

# 3. Crear volumen para PostgreSQL
docker volume create pgdata-lab

# 4. Desplegar PostgreSQL en red overlay
docker run -d --name db \
  --network lab-net \
  -v pgdata-lab:/var/lib/postgresql/data \
  -e POSTGRES_DB=app \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

# 5. Verificar conectividad desde otro contenedor
docker run --rm --network lab-net alpine:3.20 \
  sh -c "apk add --no-cache postgresql-client && pg_isready -h db -U postgres"

# 6. Insertar datos
docker run --rm --network lab-net postgres:16-alpine \
  psql -h db -U postgres -d app -c "CREATE TABLE test (id SERIAL, data TEXT); INSERT INTO test (data) VALUES ('persistente');"

# 7. Eliminar contenedor DB
docker rm -f db

# 8. Recrear DB con mismo volumen
docker run -d --name db \
  --network lab-net \
  -v pgdata-lab:/var/lib/postgresql/data \
  -e POSTGRES_DB=app \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

# 9. Verificar datos persisten
docker run --rm --network lab-net postgres:16-alpine \
  psql -h db -U postgres -d app -c "SELECT * FROM test;"
# Debe mostrar: id=1, data='persistente'
```

---

## 2.7 Laboratorio 2.2: Stack completo con Compose

### Objetivo

Levantar stack completo (frontend, API, DB, worker, Redis) con `docker compose up -d` y validar conectividad end-to-end.

### Archivos necesarios (ya creados en día 1 + nuevos)

```
mi-curso-docker/
├── docker-compose.yml
├── docker-compose.override.yml
├── docker-compose.prod.yml
├── .env.example
├── secrets/
│   ├── db_password.txt
│   └── jwt_secret.txt
└── apps/
    ├── frontend/Dockerfile + nginx.conf
    ├── api/Dockerfile
    ├── worker/Dockerfile
    └── db/init.sql
```

### Pasos guiados

```bash
# 1. Preparar secrets (desarrollo)
mkdir -p secrets
echo "postgres" > secrets/db_password.txt
echo "mi-jwt-secret-super-seguro" > secrets/jwt_secret.txt

# 2. Preparar .env
cp .env.example .env
# Editar OWNER=tu-usuario-github

# 3. Build imágenes (si no están en registry)
docker compose build

# 4. Levantar stack desarrollo
docker compose up -d

# 5. Verificar estado
docker compose ps
# Todos deben estar "healthy" o "running"

# 6. Ver logs
docker compose logs -f api

# 7. Test end-to-end
# Frontend
curl -f http://localhost:8080/healthz
curl http://localhost:8080/

# API
curl -f http://localhost:3000/healthz
curl http://localhost:3000/api/health

# DB (desde contenedor)
docker compose exec db pg_isready -U postgres

# Redis
docker compose exec redis redis-cli ping

# 8. Verificar redes
docker compose exec api nslookup db
docker compose exec api nslookup redis
docker compose exec frontend nslookup api

# 9. Verificar volúmenes
docker volume ls | grep -E 'pgdata|redisdata'
docker compose exec db ls -la /var/lib/postgresql/data/

# 10. Test persistencia: reiniciar stack
docker compose down
docker compose up -d
# Verificar datos en DB siguen ahí

# 11. Escalar worker
docker compose up -d --scale worker=3
docker compose ps worker

# 12. Limpieza
docker compose down -v  # -v elimina volúmenes named
```

---

## 2.8 Caso de uso y entregable día 2

### Aplicación al proyecto

```
mi-curso-docker/
├── docker-compose.yml           # Base (producción-ready)
├── docker-compose.override.yml  # Desarrollo (auto-cargado)
├── docker-compose.prod.yml      # Producción (Swarm deploy)
├── .env.example
├── secrets/
│   ├── db_password.txt
│   └── jwt_secret.txt
├── apps/
│   ├── frontend/{Dockerfile,nginx.conf,.dockerignore}
│   ├── api/{Dockerfile,.dockerignore}
│   ├── worker/{Dockerfile,.dockerignore}
│   └── db/init.sql
└── Makefile (actualizado con targets compose)
```

### Entregable obligatorio (push antes del día 3)

- [ ] `docker-compose.yml` base con 5 servicios, healthchecks, resource limits, networks, volumes, secrets, configs.
- [ ] `docker-compose.override.yml` para desarrollo (hot reload, puertos expuestos, target builder).
- [ ] `docker-compose.prod.yml` para producción (replicas, update_config, placement).
- [ ] `.env.example` documentado.
- [ ] `secrets/` con archivos de ejemplo (no commitear reales).
- [ ] `Makefile` actualizado: `compose-up`, `compose-down`, `compose-logs`, `compose-ps`, `compose-build`, `compose-prod`.
- [ ] Stack levantado y validado: `docker compose up -d` → todos healthy → curl endpoints OK.
- [ ] Persistencia verificada: `docker compose down && docker compose up -d` → datos en DB intactos.
- [ ] Escalado probado: `docker compose up -d --scale worker=3` → 3 workers corriendo.

### Makefile targets adicionales

```makefile
# En Makefile (añadir al final)

compose-up: ## Levantar stack desarrollo
	docker compose up -d

compose-down: ## Bajar stack desarrollo
	docker compose down

compose-down-v: ## Bajar stack + volúmenes
	docker compose down -v

compose-logs: ## Ver logs (seguir)
	docker compose logs -f

compose-ps: ## Estado servicios
	docker compose ps

compose-build: ## Build imágenes
	docker compose build

compose-prod: ## Levantar stack producción (requiere Swarm)
	docker compose -f docker-compose.yml -f docker-compose.prod.yml config > docker-compose.resolved.yml
	docker stack deploy -c docker-compose.resolved.yml curso-docker

compose-prod-down: ## Bajar stack producción
	docker stack rm curso-docker
```

---

## Checkpoint validación

```bash
# validate.sh lab-2
#!/usr/bin/env bash
set -euo pipefail

echo "1. Archivos compose existen..."
[[ -f docker-compose.yml ]] || { echo "❌ Falta docker-compose.yml"; exit 1; }
[[ -f docker-compose.override.yml ]] || { echo "❌ Falta override.yml"; exit 1; }
[[ -f docker-compose.prod.yml ]] || { echo "❌ Falta prod.yml"; exit 1; }

echo "2. Servicios definidos..."
SERVICES=$(docker compose config --services)
for s in frontend api worker db redis; do
  echo "$SERVICES" | grep -q "^$s$" || { echo "❌ Falta servicio $s"; exit 1; }
done

echo "3. Healthchecks en todos..."
for s in frontend api worker db redis; do
  docker compose config | grep -A 20 "^  $s:" | grep -q "healthcheck:" || { echo "❌ $s sin healthcheck"; exit 1; }
done

echo "4. Networks definidas..."
docker compose config | grep -q "frontend-net"
docker compose config | grep -q "backend-net"
docker compose config | grep -q "internal: true"

echo "5. Volumes named..."
docker compose config | grep -q "pgdata:"
docker compose config | grep -q "redisdata:"

echo "6. Secrets definidos..."
docker compose config | grep -q "db_password:"
docker compose config | grep -q "jwt_secret:"

echo "7. Resource limits..."
for s in frontend api worker db redis; do
  docker compose config | grep -A 30 "^  $s:" | grep -q "limits:" || { echo "❌ $s sin limits"; exit 1; }
done

echo "8. Stack levantado y healthy..."
docker compose up -d
sleep 30
for s in frontend api worker db redis; do
  HEALTH=$(docker compose ps --format json $s | jq -r '.Health // "none"')
  [[ "$HEALTH" == "healthy" || "$HEALTH" == "running" ]] || { echo "❌ $s no healthy: $HEALTH"; exit 1; }
done

echo "9. Conectividad end-to-end..."
curl -f http://localhost:8080/healthz
curl -f http://localhost:3000/healthz

echo "✅ Checkpoint día 2 superado"
```

---

## Recursos post-sesión

- [Compose specification](https://github.com/compose-spec/compose-spec)
- [Docker networking](https://docs.docker.com/network/)
- [Manage data in Docker](https://docs.docker.com/storage/)
- [Compose environment variables](https://docs.docker.com/compose/environment-variables/)
- [Secrets in Compose](https://docs.docker.com/compose/use-secrets/)
- [Resource constraints](https://docs.docker.com/config/containers/resource_constraints/)