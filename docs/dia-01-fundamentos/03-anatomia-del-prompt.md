# Día 1 - 03: Anatomía del prompt Dockerfile

## Objetivos de la sesión

- [ ] Dominar todas las instrucciones Dockerfile y su propósito.
- [ ] Entender la diferencia semántica entre `ENTRYPOINT` vs `CMD`.
- [ ] Aplicar `HEALTHCHECK`, `USER`, `WORKDIR`, `ARG`, `ENV` correctamente.
- [ ] Usar `ONBUILD` para imágenes base reutilizables.
- [ ] Escribir `.dockerignore` efectivo.
- [ ] Lint con `hadolint` y corregir warnings.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap + preguntas |
| 40 min | Repaso exhaustivo instrucciones Dockerfile (cheat sheet) |
| 20 min | Demo: `ENTRYPOINT` vs `CMD`, `ARG` vs `ENV`, `HEALTHCHECK` |
| 10 min | Break |
| 50 min | Laboratorio guiado: Dockerfile completo para api + lint |
| 20 min | `.dockerignore` patterns avanzados + validación contexto |
| 10 min | Preguntas + checkpoint |

---

## Cheat sheet: Instrucciones Dockerfile

| Instrucción | Sintaxis | Propósito | Ejemplo |
|-------------|----------|-----------|---------|
| `FROM` | `FROM <image>[:<tag>] [AS <name>]` | Imagen base / stage | `FROM node:20-alpine AS builder` |
| `ARG` | `ARG <name>[=<default>]` | Variable build-time | `ARG NODE_VERSION=20` |
| `ENV` | `ENV <key>=<value> ...` | Variable runtime | `ENV NODE_ENV=production` |
| `WORKDIR` | `WORKDIR /path` | Directorio trabajo | `WORKDIR /app` |
| `COPY` | `COPY [--chown=<user:group>] <src> <dest>` | Copiar archivos | `COPY --chown=node:node package*.json .` |
| `ADD` | `ADD <src> <dest>` | Copiar + auto-extract tar/URL | `ADD https://example.com/file.tar.gz /` |
| `RUN` | `RUN <command>` / `RUN ["exe","arg"]` | Ejecutar en build | `RUN npm ci --only=production` |
| `USER` | `USER <user>[:<group>]` | Usuario runtime | `USER 1001:1001` |
| `EXPOSE` | `EXPOSE <port>[/tcp\|udp]` | Documentar puerto | `EXPOSE 3000/tcp` |
| `VOLUME` | `VOLUME ["/path"]` | Declarar mount point | `VOLUME ["/data"]` |
| `HEALTHCHECK` | `HEALTHCHECK [OPTIONS] CMD ...` | Comprobación vida | `HEALTHCHECK CMD curl -f localhost:3000/healthz` |
| `ENTRYPOINT` | `ENTRYPOINT ["exe","arg"]` | Ejecutable fijo | `ENTRYPOINT ["node","server.js"]` |
| `CMD` | `CMD ["arg","arg"]` | Args por defecto | `CMD ["--port","3000"]` |
| `ONBUILD` | `ONBUILD <INSTRUCTION>` | Trigger en imagen hija | `ONBUILD COPY . /app` |
| `LABEL` | `LABEL key=value` | Metadatos | `LABEL org.opencontainers.image.source=...` |
| `STOPSIGNAL` | `STOPSIGNAL SIGTERM` | Señal parada | `STOPSIGNAL SIGTERM` |
| `SHELL` | `SHELL ["exe","-c"]` | Shell para RUN | `SHELL ["/bin/bash","-c"]` |

---

## ENTRYPOINT vs CMD: la confusión clásica

### Forma exec (recomendada) vs shell

```dockerfile
# ✅ EXEC FORM - JSON array, sin shell, señales propagadas
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]

# ❌ SHELL FORM - string, invoca /bin/sh -c, PID 1 = shell
ENTRYPOINT node server.js
CMD --port 3000
```

### Combinación: ENTRYPOINT fijo + CMD sobrescribible

```dockerfile
# Imagen base
ENTRYPOINT ["node", "server.js"]
CMD ["--port", "3000"]

# Usuario puede sobrescribir CMD:
docker run mi-imagen --port 4000  # Ejecuta: node server.js --port 4000
docker run --entrypoint sh mi-imagen  # Sobrescribe ENTRYPOINT
```

### Patrón "entrypoint script" para lógica compleja

```dockerfile
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
```

```bash
#!/bin/sh
# docker-entrypoint.sh
set -e

# Migraciones DB si variable presente
if [ -n "$RUN_MIGRATIONS" ]; then
  echo "Running migrations..."
  npm run migrate
fi

# Ejecutar comando pasado (CMD o override)
exec "$@"
```

---

## ARG vs ENV: build-time vs runtime

| Característica | `ARG` | `ENV` |
|----------------|-------|-------|
| **Disponibilidad** | Solo durante `docker build` | Build + runtime (contenedor) |
| **Herencia** | No (salvo `ARG` en `FROM`) | Sí (capas hijas y contenedor) |
| **Override build** | `--build-arg KEY=val` | No (usa `ARG` + `ENV`) |
| **Override run** | No | `-e KEY=val` / `docker-compose environment` |
| **Seguridad** | No en imagen final (salvo `ARG` en `FROM`) | **Visible en `docker inspect` y capas** |

### Patrón recomendado: ARG → ENV

```dockerfile
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS builder

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}  # Persiste en imagen final

# En runtime: docker run -e APP_VERSION=1.2.3 mi-imagen
```

### Secrets: NUNCA en ENV ni ARG

```dockerfile
# ❌ MALO: Secret en capa de imagen
ARG NPM_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN
RUN npm publish

# ✅ BUENO: BuildKit secret mount (no persiste en imagen)
# syntax=docker/dockerfile:1.7
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)" \
    && npm publish
```

```bash
# Build con secret
docker build --secret id=npm_token,src=$HOME/.npmrc .
```

---

## HEALTHCHECK: más que un check

### Sintaxis completa

```dockerfile
HEALTHCHECK \
  --interval=30s \      # Cada cuánto (default 30s)
  --timeout=3s \        # Timeout del comando (default 30s)
  --start-period=10s \  # Gracia inicial (default 0s)
  --retries=3 \         # Fallos antes de unhealthy (default 3)
  CMD curl -f http://localhost:3000/healthz || exit 1
```

### Estados de salud

```
starting → (start-period) → healthy ↔ unhealthy
                    ↑
              (retries fallos consecutivos)
```

### Comandos útiles para healthcheck

```bash
# HTTP
CMD curl -f http://localhost:3000/healthz || exit 1

# TCP (netcat)
CMD nc -z localhost 5432 || exit 1

# Proceso interno (pid 1)
CMD pgrep -x node > /dev/null || exit 1

# Script personalizado
CMD /usr/local/bin/healthcheck.sh || exit 1
```

### Ver estado

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Health}}'
docker inspect --format '{{.State.Health.Status}}' mi-contenedor
docker inspect --format '{{json .State.Health.Log}}' mi-contenedor | jq
```

---

## USER: non-root obligatorio

### Crear usuario en Alpine

```dockerfile
RUN addgroup -g 1001 -S appgroup && \
    adduser -S -u 1001 -G appgroup appuser
USER appuser
```

### Crear usuario en Debian/Ubuntu

```dockerfile
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -m -s /bin/bash appuser
USER appuser
```

### Distroless: usuario ya existe

```dockerfile
FROM gcr.io/distroless/nodejs20-debian12
USER nonroot:nonroot  # UID 65532
```

### Permisos en archivos copiados

```dockerfile
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist
# O en runtime (si no se puede en COPY):
USER root
RUN chown -R appuser:appgroup /app
USER appuser
```

---

## WORKDIR, VOLUME, STOPSIGNAL, SHELL

### WORKDIR

```dockerfile
WORKDIR /app  # Crea si no existe
# Rutas relativas posteriores usan /app
COPY . .      # Copia a /app
RUN npm run build  # Ejecuta en /app
```

### VOLUME (declarativo, no monta)

```dockerfile
VOLUME ["/data", "/var/log/app"]
# En runtime: docker run -v host-path:/data mi-imagen
# Si no se monta: Docker crea anonymous volume
```

### STOPSIGNAL

```dockerfile
# App Node.js maneja SIGTERM para graceful shutdown
STOPSIGNAL SIGTERM
# Default: SIGTERM (15). Para apps que necesitan SIGKILL: STOPSIGNAL SIGKILL
```

### SHELL

```dockerfile
# Para usar bash features en RUN (pipefail, arrays, etc.)
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN set -euo pipefail && command1 | command2
```

---

## ONBUILD: imágenes base para equipos

```dockerfile
# Dockerfile.base
FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Triggers para imágenes hijas
ONBUILD COPY --chown=appuser:appgroup package*.json ./
ONBUILD RUN npm ci --only=production
ONBUILD COPY --chown=appuser:appgroup . .
ONBUILD RUN npm run build
ONBUILD USER appuser
ONBUILD EXPOSE 3000
ONBUILD CMD ["node", "dist/server.js"]
```

```dockerfile
# Dockerfile.app (hija)
FROM mi-registry/base-node:20
# Automáticamente ejecuta todos los ONBUILD
# Solo necesita código fuente
```

---

## LABELS: metadatos estándar (OCI Image Spec)

```dockerfile
LABEL \
  org.opencontainers.image.title="Mi API" \
  org.opencontainers.image.description="API REST para el curso" \
  org.opencontainers.image.version="1.0.0" \
  org.opencontainers.image.created="2024-01-15T10:00:00Z" \
  org.opencontainers.image.revision="abc123def" \
  org.opencontainers.image.source="https://github.com/usuario/mi-api" \
  org.opencontainers.image.documentation="https://github.com/usuario/mi-api/blob/main/README.md" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.authors="Nombre <email@dominio.com>" \
  org.opencontainers.image.vendor="Mi Empresa" \
  org.opencontainers.image.base.name="node" \
  org.opencontainers.image.base.digest="sha256:..."
```

```bash
# Ver labels
docker image inspect mi-imagen --format '{{json .Config.Labels}}' | jq
```

---

## .dockerignore avanzado

### Patrones soportados (gitignore-style)

```dockerignore
# Comentarios
# Negación con !
# Directorios con /

# Git
.git
.gitignore

# Dependencias (se instalan en build)
node_modules
vendor
target
__pycache__
*.pyc
.pytest_cache

# Build outputs
dist
build
*.egg-info
*.tar.gz
*.whl

# Logs y temp
*.log
*.tmp
*.swp
*~

# IDE / OS
.vscode
.idea
*.swp
.DS_Store
Thumbs.db

# Config local / secrets
.env
.env.*
*.pem
*.key
*.crt
secrets/
config/local.*

# Tests y docs (opcional: excluirlos de imagen)
tests/
spec/
docs/
README.md
CHANGELOG.md

# Docker artifacts
Dockerfile*
docker-compose*.yml
.dockerignore
```

### Validar contexto enviado

```bash
# Ver qué se envía al daemon (tamaño y archivos)
docker build -t test . 2>&1 | grep "transferring context"
# O más detallado:
docker build --progress=plain -t test . 2>&1 | grep "COPY\|context"
```

---

## Laboratorio guiado: Dockerfile completo + lint

### Archivo final para `apps/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# API Service - Multi-stage Dockerfile
# =============================================================================

# ---- Build Arguments ----
ARG NODE_VERSION=20
ARG BASE_IMAGE=node:${NODE_VERSION}-alpine
ARG APP_VERSION=dev

# ---- STAGE 1: Builder ----
FROM ${BASE_IMAGE} AS builder

# Build args disponibles en este stage
ARG APP_VERSION
ARG NPM_TOKEN

WORKDIR /app

# Cache de dependencias
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

# Copiar código y build
COPY . .
RUN npm run build

# Tests (fallan el build si fallan)
RUN npm test

# ---- STAGE 2: Runtime ----
FROM ${BASE_IMAGE} AS runtime

# Metadata OCI
LABEL \
  org.opencontainers.image.title="Course API" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="API REST del curso Docker Fundamentals"

# Runtime args
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S -u 1001 -G appgroup appuser

# Copiar solo artefactos de producción
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Read-only filesystem ready: directorios writables
USER root
RUN mkdir -p /tmp/app /var/run/app && \
    chown -R appuser:appgroup /tmp/app /var/run/app
USER appuser

# Puerto documentado
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"

# Entrypoint + CMD
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

### Ejecutar hadolint

```bash
# Local
hadolint apps/api/Dockerfile

# En CI (GitHub Actions)
# - uses: hadolint/hadolint-action@v3.1.0
#   with:
#     dockerfile: apps/api/Dockerfile
#     failure-threshold: warning
```

### Warnings comunes y fixes

| Warning | Causa | Fix |
|---------|-------|-----|
| `DL3008` | `apt-get update` sin `apt-get install -y` en mismo RUN | Combinar en un RUN |
| `DL3009` | `apt-get install` sin `--no-install-recommends` | Añadir flag |
| `DL3015` | `COPY . .` sin `.dockerignore` | Crear `.dockerignore` |
| `DL3018` | `apk add` sin `--no-cache` | Añadir `--no-cache` |
| `DL3025` | `WORKDIR` duplicado | Usar uno solo |
| `DL3027` | `ARG` usado antes de `FROM` (salvo en `FROM`) | Mover después de `FROM` |
| `DL3042` | `COPY` sin `--chown` en multi-stage | Añadir `--chown` |
| `SC2086` | Variable sin comillas en shell form | Usar exec form o comillas |

---

## Checkpoint validación

```bash
# validate.sh lab-1-3
#!/usr/bin/env bash
set -euo pipefail

DOCKERFILE="apps/api/Dockerfile"

echo "1. Hadolint sin warnings..."
hadolint --failure-threshold=warning "$DOCKERFILE" || exit 1

echo "2. Instrucciones obligatorias presentes..."
grep -q '^USER ' "$DOCKERFILE" || { echo "❌ Falta USER"; exit 1; }
grep -q '^HEALTHCHECK' "$DOCKERFILE" || { echo "❌ Falta HEALTHCHECK"; exit 1; }
grep -q '^EXPOSE' "$DOCKERFILE" || { echo "❌ Falta EXPOSE"; exit 1; }
grep -q '^ENTRYPOINT' "$DOCKERFILE" || { echo "❌ Falta ENTRYPOINT"; exit 1; }

echo "3. Multi-stage (FROM ... AS)..."
grep -c '^FROM.*AS' "$DOCKERFILE" | grep -q '^2$' || { echo "❌ Se esperan 2 stages"; exit 1; }

echo "4. .dockerignore existe..."
[[ -f apps/api/.dockerignore ]] || { echo "❌ Falta .dockerignore"; exit 1; }

echo "5. No secrets en ENV/ARG..."
! grep -qE '^(ENV|ARG).*_(TOKEN|KEY|SECRET|PASSWORD)=' "$DOCKERFILE" || { echo "❌ Posible secret en ENV/ARG"; exit 1; }

echo "✅ Checkpoint 1.3 superado"
```

---

## Recursos post-sesión

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/)
- [Hadolint rules](https://github.com/hadolint/hadolint#rules)
- [OCI Image Spec annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md)
- [BuildKit Dockerfile frontend](https://docs.docker.com/build/dockerfile/frontend/)
- [Entrypoint best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#entrypoint)