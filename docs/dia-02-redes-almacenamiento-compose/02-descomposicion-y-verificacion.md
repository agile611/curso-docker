# Día 2 - 02: Descomposición y verificación (Almacenamiento)

## Objetivos de la sesión

- [ ] Dominar volúmenes named, bind mounts, tmpfs, y drivers de volumen.
- [ ] Entender permisos, ownership, y problemas de UID/GID mapping.
- [ ] Implementar backup/restore, migración de volúmenes.
- [ ] Configurar drivers externos: NFS, S3, Ceph, Cloud provider.
- [ ] Depurar problemas de almacenamiento: permisos, espacio, performance.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap networking + preguntas almacenamiento |
| 30 min | Teoría: tipos de montaje, drivers, permission mapping |
| 20 min | Demo: volume create, inspect, backup, restore, permission fix |
| 10 min | Break |
| 50 min | Laboratorio guiado: volúmenes persistentes, bind mounts dev, tmpfs |
| 20 min | Laboratorio autónomo: driver NFS / migración volumen |
| 10 min | Preguntas + checkpoint |

---

## Tipos de montaje: comparativa detallada

| Característica | Named Volume | Bind Mount | tmpfs |
|----------------|--------------|------------|-------|
| **Gestión** | Docker (`/var/lib/docker/volumes/`) | Usuario (path host) | Kernel (RAM) |
| **Persistencia** | Sí (survive rm) | Sí (host path) | No (desaparece al stop) |
| **Portabilidad** | Alta (docker volume ls) | Baja (path host específico) | N/A |
| **Performance** | Buena (local driver) | Nativa (host FS) | Máxima (RAM) |
| **Compartir** | Fácil (mismo nombre) | Fácil (mismo path) | No (por contenedor) |
| **Backup** | `docker run --volumes-from` | `tar` directo host | N/A |
| **Drivers** | local, nfs, sshfs, cloud | N/A | N/A |
| **UID/GID** | Mapeo automático (ver abajo) | Directo (host UID) | root:root |

---

## Named Volumes: ciclo de vida completo

### Crear con opciones

```bash
# Default (local driver)
docker volume create pgdata

# Con driver local + opciones (bind mount a path host específico)
docker volume create --driver local \
  --opt type=none \
  --opt device=/mnt/data/postgres \
  --opt o=bind \
  pgdata-host

# Con driver local + tmpfs (en memoria)
docker volume create --driver local \
  --opt type=tmpfs \
  --opt o=size=100m,uid=1000,gid=1000 \
  pgdata-tmpfs

# NFS (requiere nfs-client en host)
docker volume create --driver local \
  --opt type=nfs4 \
  --opt o=addr=192.168.1.100,rw,hard,intr \
  --opt device=:/exports/pgdata \
  pgdata-nfs
```

### Inspeccionar y usar

```bash
# Detalles
docker volume inspect pgdata
# Mountpoint: /var/lib/docker/volumes/pgdata/_data

# Usar en contenedor
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:16

# Ver montaje
docker inspect db | jq '.[0].Mounts[] | select(.Type=="volume")'
```

### Permisos y UID/GID mapping

**Problema común**: Imagen usa UID 999 (postgres), host tiene UID 1000.

```bash
# Volumen named: Docker NO mapea UIDs automáticamente
# El directorio en host (/var/lib/docker/volumes/pgdata/_data) pertenece a root:root
# Contenedor postgres (UID 999) no puede escribir → Error "Permission denied"
```

### Soluciones

#### 1. Fix en Dockerfile (recomendado)

```dockerfile
# En stage runtime
USER root
RUN mkdir -p /var/lib/postgresql/data && chown -R postgres:postgres /var/lib/postgresql/data
USER postgres
```

#### 2. Init container (sidecar)

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    # ... config

  db-init:
    image: busybox
    volumes:
      - pgdata:/data
    command: sh -c "chown -R 999:999 /data"
    deploy:
      restart_policy:
        condition: none
```

#### 3. Bind mount con UID host conocido

```bash
# En host: crear directorio con UID correcto
sudo mkdir -p /mnt/data/pgdata
sudo chown -R 999:999 /mnt/data/pgdata

# Usar bind mount
docker run -d --name db -v /mnt/data/pgdata:/var/lib/postgresql/data postgres:16
```

#### 4. User namespace remapping (daemon level)

```json
// /etc/docker/daemon.json
{
  "userns-remap": "default"
}
```
- Mapea UID 0 (root en contenedor) → UID 100000+ en host.
- Requiere reiniciar daemon. Afecta TODOS los contenedores.

---

## Bind Mounts: desarrollo y producción

### Desarrollo: hot reload

```yaml
# docker-compose.override.yml
services:
  api:
    volumes:
      - ./apps/api:/app
      - /app/node_modules  # Anonymous volume para no sobrescribir node_modules
    command: npm run dev
```

**Truco `/app/node_modules`**: Anonymous volume "protege" node_modules del contenedor para que no sea sobrescrito por el bind mount del código host.

### Producción: config y certs

```yaml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - /etc/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/log/nginx:/var/log/nginx
```

### Permisos en bind mounts

```bash
# Host UID 1000, contenedor UID 1001 → mismatch
# Solución: alinear UIDs en Dockerfile
RUN adduser -u 1000 -D appuser  # Match host UID
USER appuser
```

---

## tmpfs: memoria para datos efímeros

### Casos de uso

- `/tmp`, `/var/run`, `/var/cache` - writable en read-only rootfs.
- Secrets runtime (tokens, claves) - no tocan disco.
- Cache de aplicación (Redis, Varnish) - performance.

### Configuración

```dockerfile
# Dockerfile
VOLUME ["/tmp", "/var/run", "/var/cache/nginx"]
# O en runtime:
# docker run --tmpfs /tmp:rw,noexec,nosuid,size=100m ...
```

```yaml
# docker-compose.yml
services:
  api:
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=100m
      - /var/run:rw,size=10m
    read_only: true  # Rootfs read-only
```

### Opciones tmpfs

| Opción | Descripción |
|--------|-------------|
| `rw` / `ro` | Read-write / read-only |
| `noexec` | No ejecutar binarios |
| `nosuid` | Ignorar setuid/setgid |
| `nodev` | No device files |
| `size=100m` | Límite tamaño (default: 50% RAM) |
| `mode=1777` | Permisos (sticky bit) |
| `uid=1000,gid=1000` | Ownership |

---

## Drivers de volumen externos

### NFS

```bash
# Host: instalar nfs-client
apt-get install -y nfs-common

# Crear volumen
docker volume create --driver local \
  --opt type=nfs4 \
  --opt o=addr=192.168.1.100,rw,hard,intr,vers=4.1 \
  --opt device=:/exports/data \
  nfs-data

# Usar
docker run -d -v nfs-data:/data mi-app
```

### SSHFS (plugin)

```bash
# Instalar plugin
docker plugin install vieux/sshfs

# Crear volumen
docker volume create --driver vieux/sshfs \
  -o sshcmd=user@host:/remote/path \
  -o allow_other \
  sshfs-vol
```

### Cloud providers (ejemplos)

| Proveedor | Driver | Comando |
|-----------|--------|---------|
| AWS EBS | `rexray/ebs` | `docker volume create -d rexray/ebs --opt size=10` |
| GCP Persistent Disk | `gcepd` | `docker volume create -d gcepd --opt size=10` |
| Azure Disk | `azurefile` | `docker volume create -d azurefile --opt share=myshare` |
| Ceph/RBD | `rbd` | `docker volume create -d rbd --opt pool=volumes` |

---

## Backup y Restore de volúmenes

### Backup (método universal)

```bash
# 1. Contenedor temporal con volumen montado + backup volume
docker run --rm \
  -v pgdata:/data:ro \
  -v $(pwd):/backup \
  alpine:3.20 \
  tar czf /backup/pgdata-$(date +%F).tar.gz -C /data .

# 2. Verificar
tar tzf pgdata-2024-01-15.tar.gz | head
```

### Restore

```bash
# 1. Crear volumen destino (si no existe)
docker volume create pgdata-restore

# 2. Restaurar
docker run --rm \
  -v pgdata-restore:/data \
  -v $(pwd):/backup \
  alpine:3.20 \
  tar xzf /backup/pgdata-2024-01-15.tar.gz -C /data
```

### Backup incremental (rsync)

```bash
# Requiere contenedor con rsync
docker run --rm \
  -v pgdata:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine/rsync:3.2 \
  rsync -av --delete /data/ /backup/pgdata-latest/
```

### Automatización con cron (en host)

```bash
# /etc/cron.d/docker-volume-backup
0 2 * * * root docker run --rm -v pgdata:/data:ro -v /backups:/backup alpine tar czf /backup/pgdata-$(date +\%F).tar.gz -C /data .
```

---

## Migración de volúmenes

### Entre hosts (mismo driver)

```bash
# Host origen: backup
docker run --rm -v pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz -C /data .

# Copiar archivo a host destino
scp pgdata.tar.gz user@host-destino:/tmp/

# Host destino: restore
docker run --rm -v pgdata:/data -v /tmp:/backup alpine tar xzf /backup/pgdata.tar.gz -C /data
```

### Entre drivers (local → NFS)

```bash
# 1. Backup desde local
docker run --rm -v pgdata-local:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz -C /data .

# 2. Crear volumen NFS
docker volume create --driver local --opt type=nfs4 --opt o=addr=192.168.1.100,rw --opt device=:/exports/pgdata pgdata-nfs

# 3. Restore a NFS
docker run --rm -v pgdata-nfs:/data -v $(pwd):/backup alpine tar xzf /backup/pgdata.tar.gz -C /data
```

---

## Laboratorio guiado: volúmenes en acción

### 1. Named volume para PostgreSQL

```bash
# Crear volumen
docker volume create pgdata-lab

# Desplegar PostgreSQL
docker run -d --name db \
  -v pgdata-lab:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

# Verificar escritura
docker exec db psql -U postgres -c "CREATE TABLE test (id SERIAL, data TEXT); INSERT INTO test (data) VALUES ('volumen named');"

# Inspeccionar en host
docker volume inspect pgdata-lab
ls -la /var/lib/docker/volumes/pgdata-lab/_data/
```

### 2. Bind mount para desarrollo (hot reload)

```bash
# En apps/api (código host)
docker run -d --name api-dev \
  -v $(pwd)/apps/api:/app \
  -v /app/node_modules \
  -p 3000:3000 \
  ghcr.io/usuario/api:latest \
  npm run dev

# Editar archivo en host → ver reload en logs
docker logs -f api-dev
```

### 3. tmpfs para read-only rootfs

```bash
# Contenedor con rootfs read-only + tmpfs
docker run -d --name api-ro \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=50m \
  --tmpfs /var/run:rw,size=10m \
  ghcr.io/usuario/api:latest

# Verificar
docker exec api-ro touch /tmp/test.txt  # OK
docker exec api-ro touch /test.txt      # Error: Read-only file system
```

### 4. Backup y restore

```bash
# Backup
docker run --rm -v pgdata-lab:/data:ro -v $(pwd):/backup alpine tar czf /backup/pgdata-backup.tar.gz -C /data .

# Eliminar volumen original
docker volume rm pgdata-lab

# Recrear y restore
docker volume create pgdata-lab
docker run --rm -v pgdata-lab:/data -v $(pwd):/backup alpine tar xzf /backup/pgdata-backup.tar.gz -C /data

# Verificar datos
docker run --rm -v pgdata-lab:/data alpine cat /data/test.txt
```

---

## Laboratorio autónomo: Driver NFS / Migración

### Opción A: Configurar volumen NFS

**Requisitos**: Servidor NFS accesible (puede ser contenedor NFS en mismo host).

```bash
# 1. Levantar servidor NFS (solo lab)
docker run -d --name nfs-server --privileged \
  -v /mnt/nfs-exports:/exports \
  -e SHARED_DIRECTORY=/exports \
  itsthenetwork/nfs-server-alpine:latest

# 2. Obtener IP
NFS_IP=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' nfs-server)

# 3. Crear volumen NFS client
docker volume create --driver local \
  --opt type=nfs4 \
  --opt o=addr=$NFS_IP,rw,vers=4.1 \
  --opt device=:/exports/data \
  nfs-lab

# 4. Probar
docker run --rm -v nfs-lab:/data alpine sh -c "echo 'NFS test' > /data/test.txt && cat /data/test.txt"
```

### Opción B: Migrar volumen local → NFS

```bash
# 1. Crear volumen local con datos
docker volume create local-data
docker run --rm -v local-data:/data alpine sh -c "echo 'dato 1' > /data/a.txt; echo 'dato 2' > /data/b.txt"

# 2. Backup
docker run --rm -v local-data:/data:ro -v $(pwd):/backup alpine tar czf /backup/local-data.tar.gz -C /data .

# 3. Crear volumen NFS (ver opción A)
# 4. Restore a NFS
docker run --rm -v nfs-lab:/data -v $(pwd):/backup alpine tar xzf /backup/local-data.tar.gz -C /data

# 5. Verificar
docker run --rm -v nfs-lab:/data alpine ls -la /data/
```

---

## Checkpoint validación

```bash
# validate.sh lab-2-2
#!/usr/bin/env bash
set -euo pipefail

echo "1. Named volume pgdata-lab existe..."
docker volume inspect pgdata-lab >/dev/null || exit 1

echo "2. PostgreSQL escribe en volumen..."
docker exec db psql -U postgres -c "SELECT * FROM test;" | grep -q 'volumen named'

echo "3. Bind mount dev funciona (node_modules protegido)..."
docker exec api-dev ls /app/node_modules >/dev/null 2>&1 || exit 1

echo "4. tmpfs en read-only container..."
docker exec api-ro touch /tmp/test.txt
! docker exec api-ro touch /test.txt 2>/dev/null || exit 1

echo "5. Backup/restore funciona..."
docker run --rm -v pgdata-lab:/data alpine cat /data/test.txt | grep -q 'volumen named'

echo "✅ Checkpoint 2.2 superado"
```

---

## Recursos post-sesión

- [Docker volumes](https://docs.docker.com/storage/volumes/)
- [Bind mounts](https://docs.docker.com/storage/bind-mounts/)
- [tmpfs mounts](https://docs.docker.com/storage/tmpfs/)
- [Volume driver plugins](https://docs.docker.com/engine/extend/plugins_volume/)
- [NFS volume driver](https://docs.docker.com/storage/volumes/#use-a-volume-driver)
- [User namespace remapping](https://docs.docker.com/engine/security/userns-remap/)