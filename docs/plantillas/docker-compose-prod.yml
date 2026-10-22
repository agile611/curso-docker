# docker-compose.prod.yml (Producción Swarm Deploy)

```yaml
# =============================================================================
# TaskFlow - Docker Compose Production (Swarm Deploy)
# =============================================================================
# Uso: docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml taskflow
# Requiere: Swarm mode activo (docker swarm init)

services:
  # ---------------------------------------------------------------------------
  # FRONTEND
  # ---------------------------------------------------------------------------
  frontend:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/frontend:${VERSION:-latest}
    # Puertos en modo ingress (load balanced across swarm)
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
        max_failure_ratio: 0.1
        order: start-first
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
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
      labels:
        - "com.taskflow.service=frontend"
        - "com.taskflow.version=${VERSION}"
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

  # ---------------------------------------------------------------------------
  # API
  # ---------------------------------------------------------------------------
  api:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/api:${VERSION:-latest}
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
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
        monitor: 30s
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
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 128M
      labels:
        - "com.taskflow.service=api"
        - "com.taskflow.version=${VERSION}"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 15s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # WORKER
  # ---------------------------------------------------------------------------
  worker:
    image: ${REGISTRY:-ghcr.io}/${OWNER}/worker:${VERSION:-latest}
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/taskflow
      - REDIS_URL=redis://redis:6379
    secrets:
      - jwt_secret
    networks:
      - backend-net
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
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
      labels:
        - "com.taskflow.service=worker"
        - "com.taskflow.version=${VERSION}"
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
    networks:
      - backend-net
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        delay: 30s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        delay: 10s
        max_attempts: 5
        window: 120s
      placement:
        constraints:
          - node.role == manager
          - node.labels.storage == ssd
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
      labels:
        - "com.taskflow.service=db"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d taskflow"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "10"
        labels: "service,environment,version"

  # ---------------------------------------------------------------------------
  # REDIS
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    networks:
      - backend-net
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.1'
          memory: 128M
      labels:
        - "com.taskflow.service=redis"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
        labels: "service,environment,version"

# ---------------------------------------------------------------------------
# NETWORKS (Overlay para multi-host)
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
# VOLUMES (Named volumes para persistencia)
# ---------------------------------------------------------------------------
volumes:
  pgdata:
    driver: local
    # En producción real: driver externo (NFS, EBS, Ceph, Portworx)
    # driver: local
    # driver_opts:
    #   type: nfs4
    #   o: addr=192.168.1.100,rw,hard,intr
    #   device=:/exports/pgdata
  redisdata:
    driver: local

# ---------------------------------------------------------------------------
# SECRETS (Externos - creados en Swarm)
# ---------------------------------------------------------------------------
secrets:
  db_password:
    external: true
  jwt_secret:
    external: true

# ---------------------------------------------------------------------------
# CONFIGS (Externos - creados en Swarm)
# ---------------------------------------------------------------------------
configs:
  nginx_config:
    external: true
    name: nginx-config-v1
```

## Preparación Swarm

```bash
# 1. Inicializar Swarm (manager)
docker swarm init --advertise-addr <MANAGER_IP>

# 2. Unir workers (ejecutar en cada worker)
docker swarm join --token <WORKER_TOKEN> <MANAGER_IP>:2377

# 3. Verificar nodos
docker node ls

# 4. Etiquetar nodos (para placement constraints)
docker node update --label-add zone=zone-a <NODE_ID>
docker node update --label-add storage=ssd <NODE_ID>

# 5. Crear secrets en Swarm
echo "super-secure-db-password" | docker secret create db_password -
echo "super-secure-jwt-secret-32-chars-min" | docker secret create jwt_secret -

# 6. Crear configs
docker config create nginx-config-v1 ./apps/frontend/nginx.conf

# 7. Verificar
docker secret ls
docker config ls
```

## Deploy

```bash
# Deploy stack
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml taskflow

# Ver servicios
docker stack services taskflow

# Ver tasks (contenedores reales)
docker stack ps taskflow --no-trunc

# Ver logs agregados
docker service logs -f taskflow_api

# Escalar servicio
docker service scale taskflow_api=5

# Actualizar imagen (rolling update)
docker service update --image ghcr.io/owner/api:v1.1.0 taskflow_api

# Rollback
docker service rollback taskflow_api

# Ver estado rollout
docker service ps taskflow_api --no-trunc

# Eliminar stack
docker stack rm taskflow
```

## Variables de entorno (`.env.prod`)

```bash
REGISTRY=ghcr.io
OWNER=tu-org
VERSION=v1.2.3
```

## Placement constraints explicados

| Constraint | Significado |
|------------|-------------|
| `node.role == worker` | Solo en workers (no managers) |
| `node.role == manager` | Solo en managers |
| `node.labels.zone == zone-a` | Nodo con label `zone=zone-a` |
| `node.labels.storage == ssd` | Nodo con label `storage=ssd` |
| `engine.labels.os == linux` | Solo nodos Linux |
| `node.platform.arch == arm64` | Solo arquitectura ARM64 |

## Resource limits vs reservations

| Tipo | Significado | Swarm | K8s |
|------|-------------|-------|-----|
| **limits** | Límite duro (OOM kill si excede) | ✅ | ✅ |
| **reservations** | Garantizado (scheduling) | ✅ | ✅ |

```yaml
resources:
  limits:
    cpus: '1.0'      # 1 CPU core máximo
    memory: 512M     # 512 MB máximo
  reservations:
    cpus: '0.2'      # 0.2 CPU garantizado
    memory: 128M     # 128 MB garantizado
```

## Update config (Rolling update)

```yaml
update_config:
  parallelism: 1          # Cuántos tasks actualizar a la vez
  delay: 15s              # Espera entre batches
  failure_action: rollback # Qué hacer si falla: pause|continue|rollback
  monitor: 30s            # Tiempo observando healthcheck tras update
  max_failure_ratio: 0.1  # % máximo de fallos permitidos
  order: start-first      # start-first|stop-first
```

## Rollback config

```yaml
rollback_config:
  parallelism: 1
  delay: 5s
  failure_action: pause  # pause|continue
```

## Restart policy

```yaml
restart_policy:
  condition: on-failure    # none|on-failure|any
  delay: 5s                # Espera antes de reiniciar
  max_attempts: 3          # Máximo intentos
  window: 120s             # Ventana de tiempo para contar intentos
```

## Validación producción

```bash
# 1. Verificar stack deployado
docker stack services taskflow
# Debe mostrar REPLICAS: 3/3, 3/3, 2/2, 1/1, 1/1

# 2. Verificar tasks running
docker stack ps taskflow --filter desired-state=running

# 3. Test rolling update
docker service update --image ghcr.io/owner/api:v1.1.0 taskflow_api
docker service ps taskflow_api --no-trunc  # Ver rolling

# 4. Test failover
TASK=$(docker service ps taskflow_api -q | head -1)
docker kill $(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK)
docker service ps taskflow_api  # Nuevo task creado automáticamente

# 5. Test escalado
docker service scale taskflow_api=10
docker service ps taskflow_api

# 5. Logs centralizados
docker service logs -f taskflow_api --tail 100

# 6. Ver recursos
docker stats $(docker ps -q --filter label=com.taskflow.service=api) --no-stream
```