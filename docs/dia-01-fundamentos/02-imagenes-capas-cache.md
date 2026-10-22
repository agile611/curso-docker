# Día 1 - 02: Funcionamiento y limitaciones

## Objetivos de la sesión

- [ ] Entender el modelo de capas (Union FS / OverlayFS).
- [ ] Comprender el cache de build: invalidación, optimización, `--no-cache`.
- [ ] Diferenciar tag vs digest, mutabilidad vs inmutabilidad.
- [ ] Conocer limitaciones: kernel compartido, syscalls, dispositivos, Windows/macOS VM.
- [ ] Multi-arch: manifest lists, buildx, QEMU.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap día anterior + preguntas |
| 30 min | Teoría: capas, copy-on-write, overlayfs, cache |
| 20 min | Demo: `docker history`, `dive`, `docker build --no-cache` |
| 15 min | Teoría: tags, digests, manifest list, multi-arch |
| 10 min | Break |
| 45 min | Laboratorio guiado: analizar imágenes, build con/sin cache, multi-arch |
| 15 min | Limitaciones prácticas: syscalls, /proc, /sys, dispositivos, VM oculta |
| 15 min | Preguntas + checkpoint |

---

## Capas y Union Filesystem

### Cómo funciona

```
Imagen base (read-only)
    │
    ├── Capa 1: RUN apk add curl     ← read-only
    │
    ├── Capa 2: COPY package.json    ← read-only
    │
    ├── Capa 3: RUN npm ci           ← read-only
    │
    └── Capa 4 (contenedor): RW      ← thin R/W layer (copy-on-write)
```

- **Imagen** = pila de capas read-only (content-addressable por digest SHA256).
- **Contenedor** = imagen + **una capa fina read-write** (copy-on-write).
- **OverlayFS**: fusiona capas lower (read-only) + upper (read-write) en merged view.

### Copy-on-Write (CoW)

```
1. Contenedor lee /usr/bin/curl  →  desde capa lower (imagen)
2. Contenedor escribe /tmp/x     →  en capa upper (contenedor)
3. Contenedor modifica /etc/passwd
   → copia /etc/passwd de lower a upper (CoW)
   → modifica copia en upper
   → lower intacto
```

**Implicación:** Escribir en archivos de la imagen duplica datos en capa RW del contenedor.

### Drivers de almacenamiento

| Driver | SO soporte | Características |
|--------|------------|-----------------|
| `overlay2` | Linux (kernel 4.0+) | Default, rápido, estable, soporta `overlayfs` nativo |
| `fuse-overlayfs` | Rootless, kernels antiguos | Userspace, más lento |
| `btrfs` | Linux | Snapshots nativos, dedup |
| `zfs` | Linux, FreeBSD | Snapshots, compresión, dedup |
| `vfs` | Testing/fallback | Sin CoW, copia completa, muy lento |

```bash
# Ver driver actual
docker info --format '{{.Driver}}'

# Ver capas de una imagen
docker history --no-trunc mi-imagen:tag

# Tamaño real en disco (considerando capas compartidas)
docker system df -v
```

---

## Cache de build: el talón de Aquiles

### Reglas de invalidación

| Instrucción | Invalida cache si... |
|-------------|----------------------|
| `FROM` | Cambia tag/digest de imagen base |
| `RUN` | Cambia comando **o** cambian archivos previos (COPY/ADD) |
| `COPY` / `ADD` | Cambia **contenido** (checksum) de archivos copiados |
| `ENV` / `ARG` | Cambia valor (afecta RUN posteriores) |
| `WORKDIR` / `USER` / `EXPOSE` / `VOLUME` / `LABEL` | Cambia valor (metadatos) |
| `CMD` / `ENTRYPOINT` | Cambia valor |

### Estrategias de optimización

```dockerfile
# ❌ MALO: Invalida cache en cada cambio de código
COPY . .
RUN npm ci

# ✅ BUENO: Cache deps separado de código
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
```

### Cache mounts (BuildKit) - para gestores de paquetes

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine
WORKDIR /app
# Cache npm cache entre builds
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --only=production
```

### Cache mounts para Go, Python, Rust, etc.

```dockerfile
# Go
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o /app/server .

# Python (pip)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# Rust (cargo)
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release
```

---

## Tags, Digests y Manifest Lists

### Tag = puntero mutable

```bash
docker tag mi-app:abc123 mi-app:latest
docker push mi-app:latest  # Sobrescribe tag en registry
```

### Digest = inmutable (SHA256 del manifest)

```bash
docker pull mi-app@sha256:abc123def456...  # Garantiza misma imagen siempre
```

### Manifest List (multi-arch)

```
mi-app:latest (manifest list)
├── linux/amd64  → manifest → config + layers (sha256:aaa...)
├── linux/arm64  → manifest → config + layers (sha256:bbb...)
├── linux/arm/v7 → manifest → config + layers (sha256:ccc...)
└── windows/amd64 → manifest → config + layers (sha256:ddd...)
```

```bash
# Inspeccionar manifest list
docker manifest inspect mi-app:latest

# Build multi-arch con buildx
docker buildx build --platform linux/amd64,linux/arm64 -t mi-app:latest --push .
```

---

## Limitaciones reales de contenedores

### 1. Kernel compartido = syscalls compartidas

```bash
# No puedes cargar módulos de kernel desde contenedor (sin --privileged)
docker run --rm alpine modprobe wireguard  # Error

# Syscalls bloqueadas por seccomp default
docker run --rm alpine unshare -U  # Error: unshare not allowed
```

### 2. /proc y /sys son del host (parcialmente virtualizados)

```bash
docker run --rm alpine cat /proc/cpuinfo  # CPU del HOST
docker run --rm alpine cat /proc/meminfo  # Memoria del HOST (o límite cgroup)
docker run --rm alpine ls /sys/class/net  # Interfaces del HOST
```

### 3. Dispositivos: no acceso directo (sin --device / --privileged)

```bash
# No ves /dev/sda, /dev/ttyUSB0, /dev/nvidia0
docker run --rm alpine ls /dev/
# Solo: null, zero, random, urandom, tty, console, pts/, shm/
```

### 4. Windows / macOS: VM oculta (Docker Desktop)

```
┌─────────────────────────────────────┐
│  Host (macOS/Windows)               │
│  ┌───────────────────────────────┐  │
│  │  VM Linux (LinuxKit / WSL2)   │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ containerd + runc       │  │  │
│  │  │   Contenedores          │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

- **Filesystem**: bind mounts van vía VM (virtiofs/gvproxy) → más lento.
- **Red**: `host.docker.internal` para acceder a localhost del host.
- **Recursos**: CPU/RAM asignados a VM, no al host directamente.

### 5. Root en contenedor ≠ root en host (con user namespaces)

```bash
# Sin user namespace (default)
docker run --rm -u root alpine id  # uid=0(root) → ¡Peligro si escape!

# Con user namespace (dockerd --userns-remap=default)
docker run --rm -u root alpine id  # uid=100000 (mapeado)
```

---

## Laboratorio guiado: análisis de imágenes

```bash
# 1. Analizar capas de imagen oficial
docker pull nginx:alpine
docker history nginx:alpine
dive nginx:alpine  # Navegar con flechas, 'c' para mostrar cambios

# 2. Build con y sin cache
time docker build -t test:cache .
time docker build --no-cache -t test:no-cache .
# Comparar tiempos

# 3. Ver invalidación por COPY
# Editar un archivo copiado temprano → rebuild → ver qué capas reconstruyen

# 4. Multi-arch local (requiere buildx + qemu)
docker buildx create --name test --driver docker-container --use
docker buildx build --platform linux/amd64,linux/arm64 -t test:multi --load .
# Nota: --load solo carga una arch (la nativa) en daemon local
# Para multi-arch real: --push a registry

# 5. Ver manifest list
docker manifest inspect test:multi 2>/dev/null || echo "Solo local, no manifest list"
```

---

## Checkpoint validación

```bash
# validate.sh lab-1-2
#!/usr/bin/env bash
set -euo pipefail

echo "1. Verificando comprensión de capas..."
docker history alpine:3.20 --format '{{.CreatedBy}}' | head -5

echo "2. Verificando cache mount en Dockerfile..."
grep -q 'type=cache' apps/api/Dockerfile || { echo "❌ Falta cache mount"; exit 1; }

echo "3. Verificando multi-arch..."
docker buildx ls | grep -q multiarch || { echo "❌ Builder multiarch no creado"; exit 1; }

echo "✅ Checkpoint 1.2 superado"
```

---

## Recursos post-sesión

- [OverlayFS kernel doc](https://docs.kernel.org/filesystems/overlayfs.html)
- [BuildKit cache mounts](https://docs.docker.com/build/building/cache/)
- [Multi-platform images](https://docs.docker.com/build/building/multi-platform/)
- [Container limitations](https://docs.docker.com/engine/security/userns-remap/)
- [Docker Desktop architecture](https://docs.docker.com/desktop/architecture/)