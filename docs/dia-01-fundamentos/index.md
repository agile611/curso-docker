# Día 1 · Fundamentos y ciclo de vida

## Objetivos del día

- [ ] Entender la arquitectura Docker y el modelo de contenedores OCI.
- [ ] Diferenciar imagen vs contenedor, capas, cache, tags, digests.
- [ ] Construir imágenes eficientes con Dockerfile multi-stage.
- [ ] Publicar imágenes en registry con versionado semántico.
- [ ] Aplicar `.dockerignore` y optimizar contexto de build.

---

## 1.1 Introducción: contenedores vs VMs, arquitectura Docker

### Conceptos clave

| Concepto | Descripción |
|----------|-------------|
| **Contenedor** | Proceso aislado con su propio filesystem, red, PID namespace, cgroups. Comparte kernel del host. |
| **Imagen** | Plantilla inmutable en capas (read-only). Cada instrucción Dockerfile = una capa. |
| **Registry** | Almacén de imágenes (Docker Hub, GHCR, Harbor, Artifactory). |
| **OCI** | Open Container Initiative: estándares `image-spec` y `runtime-spec`. |

### Arquitectura Docker

```
┌─────────────┐     REST API      ┌─────────────┐
│  docker CLI │ ◄────────────────► │  dockerd    │
└─────────────┘                   └──────┬──────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
             │ containerd  │       │  BuildKit   │       │  Plugins    │
             │ (runtime)   │       │  (builder)  │       │ (network,   │
             └──────┬──────┘       └─────────────┘       │  volume,    │
                    │                                    │  authz)     │
                    ▼                                    └─────────────┘
             ┌─────────────┐
             │    runc     │  (OCI runtime)
             └─────────────┘
```

### Laboratorio 1.1: Primeros pasos

```bash
# 1. Pull y run básico
docker pull alpine:3.20
docker run --rm alpine:3.20 echo "Hola desde contenedor"

# 2. Inspeccionar
docker image inspect alpine:3.20 | jq '.[0].RootFS.Layers'
docker history alpine:3.20

# 3. Commit (entender capas)
docker run -d --name mi-alpine alpine:3.20 sleep 3600
docker exec mi-alpine sh -c 'echo "capa extra" > /extra.txt'
docker commit mi-alpine mi-usuario/mi-alpine:v1
docker history mi-usuario/mi-alpine:v1

# 4. Tag y push
docker tag mi-usuario/mi-alpine:v1 mi-usuario/mi-alpine:latest
docker push mi-usuario/mi-alpine:v1

# 5. Limpieza
docker rm -f mi-alpine
docker rmi mi-usuario/mi-alpine:v1 mi-usuario/mi-alpine:latest
```

**Checkpoint:** `validate.sh lab-1-1` verifica que la imagen existe en registry remoto.

---

## 1.2 Imágenes: capas, union filesystem, cache, tags, digests

### Capas y cache

```
Dockerfile                    Capa resultante
─────────────────────────────────────────────────────────────
FROM alpine:3.20              │ Base (cached si no cambia)
RUN apk add --no-cache curl   │ + curl (cached si mismo RUN)
COPY package.json .           │ + package.json (invalida si cambia)
RUN npm ci                    │ + node_modules (cached si package.json igual)
COPY . .                      │ + código (invalida siempre)
CMD ["node","server.js"]      │ Metadatos (no capa)
```

**Regla de oro:** Ordenar instrucciones de **menos frecuente a más frecuente** para maximizar cache.

### Tags vs Digests

| Identificador | Formato | Mutabilidad | Uso |
|---------------|---------|-------------|-----|
| **Tag** | `mi-app:v1.2.3` | Mutable (puede reetiquetarse) | Desarrollo, CI/CD |
| **Digest** | `sha256:abc123...` | Inmutable (content-addressable) | Producción, referencias fijas |

```bash
# Ver digest de una imagen local
docker images --digests mi-usuario/mi-app

# Pull por digest (garantiza inmutabilidad)
docker pull mi-usuario/mi-app@sha256:abc123...

# Multi-arch: manifest list
docker manifest inspect mi-usuario/mi-app:latest
```

### Multi-arch (arm64/amd64)

```bash
# Crear builder multi-arch
docker buildx create --name multiarch --driver docker-container --use
docker buildx inspect --bootstrap

# Build y push multi-arch
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t mi-usuario/mi-app:v1.0.0 \
  --push .
```

---

## 1.3 Dockerfile: instrucciones esenciales y mejores prácticas

### Instrucciones clave

| Instrucción | Propósito | Buena práctica |
|-------------|-----------|----------------|
| `FROM` | Imagen base | Usar tags explícitos (`alpine:3.20`), no `latest` |
| `RUN` | Ejecutar en build | Encadenar con `&&`, limpiar cache en misma capa |
| `COPY` | Copiar archivos | Preferir `COPY` sobre `ADD`; usar `--chown` |
| `WORKDIR` | Directorio de trabajo | Usar ruta absoluta; crear si no existe |
| `USER` | Usuario no-root | **Obligatorio** en producción (UID > 0) |
| `EXPOSE` | Documentar puerto | No publica puerto; solo metadata |
| `ENV` | Variables de entorno | Valores por defecto; secrets en runtime |
| `HEALTHCHECK` | Comprobación de vida | `CMD curl -f http://localhost:3000/healthz \|\| exit 1` |
| `ENTRYPOINT` / `CMD` | Comando por defecto | `ENTRYPOINT` para ejecutable fijo, `CMD` para args por defecto |

### .dockerignore (crítico para contexto)

```dockerignore
# Git
.git
.gitignore

# Dependencias (se instalan en build)
node_modules
vendor
target
__pycache__
*.pyc

# Build artifacts
dist
build
*.log
*.tar.gz

# IDE / OS
.vscode
.idea
.DS_Store
Thumbs.db

# Secrets / config local
.env
.env.local
*.pem
*.key

# Tests / docs (si no se necesitan en imagen)
tests
docs
README.md
```

**Impacto:** Sin `.dockerignore`, `COPY . .` envía todo el repo al daemon (MB/GB). Con ignore, solo lo necesario (KB).

---

## 1.4 Multi-stage builds: builder pattern, distroless, scratch

### Patrón clásico (3 etapas)

```dockerfile
# ===== STAGE 1: BUILDER =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# ===== STAGE 2: TEST (opcional) =====
FROM builder AS test
RUN npm ci
RUN npm test

# ===== STAGE 3: RUNTIME =====
FROM node:20-alpine AS runtime
WORKDIR /app
# Usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
# Copiar solo artefactos de producción
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"
CMD ["node", "dist/server.js"]
```

### Distroless (Google) - aún más pequeño

```dockerfile
# Builder igual que arriba...

# Runtime distroless
FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
# Usuario non-root ya incluido en distroless (nonroot:nonroot)
EXPOSE 3000
CMD ["dist/server.js"]
```

### Scratch (Go/Rust binarios estáticos) - mínimo absoluto

```dockerfile
# Builder con toolchain completo
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server .

# Runtime: scratch (vacío)
FROM scratch AS runtime
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/server"]
```

### Comparativa de tamaños (ejemplo Node.js app)

| Imagen base | Tamaño final | Ventajas | Desventajas |
|-------------|--------------|----------|-------------|
| `node:20-alpine` | ~180 MB | Compatibilidad completa, shell, tools | Más grande |
| `gcr.io/distroless/nodejs20` | ~95 MB | Sin shell, sin package manager, seguro | Debugging difícil (usar `kubectl debug`) |
| `scratch` (solo binario) | ~15 MB | Mínimo absoluto, superficie ataque 0 | Solo binarios estáticos, sin libc |

---

## 1.5 Laboratorio 1.2: Dockerfile multi-stage para app de ejemplo

### Enunciado

Contenerizar el servicio `api` (Node.js/Express) con:
1. Stage `builder`: instalar deps, compilar TypeScript, run tests.
2. Stage `runtime`: imagen mínima (alpine o distroless), non-root, read-only ready.
3. Healthcheck funcional.
4. `.dockerignore` optimizado.
5. Build multi-arch (amd64/arm64) y push a GHCR.

### Archivos proporcionados

```
apps/api/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts
│   ├── routes/
│   └── health.ts
├── tests/
└── prisma/schema.prisma
```

### Pasos guiados

```bash
cd apps/api

# 1. Crear .dockerignore
cat > .dockerignore <<'EOF'
.git
node_modules
dist
coverage
*.log
.env
.env.*
Dockerfile*
docker-compose*.yml
.vscode
.idea
EOF

# 2. Crear Dockerfile multi-stage
cat > Dockerfile <<'EOF'
# syntax=docker/dockerfile:1.7
# ===== BUILDER =====
FROM node:20-alpine AS builder
WORKDIR /app
# Cache deps
COPY package*.json ./
RUN npm ci --only=production
# Build
COPY . .
RUN npm run build
# Tests
RUN npm test

# ===== RUNTIME =====
FROM node:20-alpine AS runtime
WORKDIR /app
# Non-root user
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
# Copiar solo producción
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
# Read-only ready: tmpfs para /tmp, /var/run
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"
CMD ["node", "dist/server.js"]
EOF

# 3. Build local y test
docker build -t mi-usuario/api:dev .
docker run --rm -p 3000:3000 mi-usuario/api:dev &
sleep 5
curl -f http://localhost:3000/healthz
docker stop $(docker ps -q --filter ancestor=mi-usuario/api:dev)

# 4. Analizar capas y tamaño
docker history mi-usuario/api:dev
docker image inspect mi-usuario/api:dev --format '{{.Size}}' | numfmt --to=iec
dive mi-usuario/api:dev  # interactivo

# 5. Build multi-arch y push a GHCR
docker buildx create --name multiarch --driver docker-container --use 2>/dev/null || true
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/mi-usuario/api:v1.0.0 \
  --push .
```

### Validación

```bash
# validate.sh lab-1-2
#!/usr/bin/env bash
set -euo pipefail
IMAGE="ghcr.io/mi-usuario/api:v1.0.0"

echo "🔍 Verificando imagen en registry..."
docker manifest inspect "$IMAGE" >/dev/null || { echo "❌ Imagen no encontrada en registry"; exit 1; }

echo "🔍 Verificando multi-arch..."
MANIFEST=$(docker manifest inspect "$IMAGE" 2>/dev/null)
PLATFORMS=$(echo "$MANIFEST" | jq -r '.manifests[].platform | "\(.os)/\(.architecture)"' | sort)
echo "Plataformas: $PLATFORMS"
[[ "$PLATFORMS" == *"linux/amd64"* ]] || { echo "❌ Falta linux/amd64"; exit 1; }
[[ "$PLATFORMS" == *"linux/arm64"* ]] || { echo "❌ Falta linux/arm64"; exit 1; }

echo "🔍 Verificando non-root..."
USER=$(docker image inspect "$IMAGE" --format '{{.Config.User}}')
[[ "$USER" == "1001" || "$USER" == "appuser" ]] || { echo "❌ Usuario no es non-root: $USER"; exit 1; }

echo "🔍 Verificando healthcheck..."
HC=$(docker image inspect "$IMAGE" --format '{{.Config.Healthcheck.Test}}')
[[ "$HC" == *"healthz"* ]] || { echo "❌ Healthcheck no configurado"; exit 1; }

echo "✅ Laboratorio 1.2 validado correctamente"
```

---

## 1.6 Caso de uso y entregable día 1

### Aplicación al proyecto del curso

Cada participante aplica lo aprendido a **sus 3 servicios** (frontend, api, worker):

```
mi-curso-docker/
├── apps/
│   ├── frontend/Dockerfile
│   ├── api/Dockerfile
│   └── worker/Dockerfile
├── .dockerignore (raíz + por servicio)
└── Makefile (targets: build, test, push)
```

### Entregable obligatorio (push a repo personal antes del día 2)

- [ ] 3 `Dockerfile` multi-stage (uno por servicio) en `apps/<servicio>/Dockerfile`.
- [ ] `.dockerignore` en raíz y por servicio.
- [ ] Imágenes publicadas en GHCR: `ghcr.io/usuario/frontend:v1.0.0`, `api:v1.0.0`, `worker:v1.0.0`.
- [ ] Multi-arch (amd64/arm64) verificado con `docker manifest inspect`.
- [ ] `hadolint` pasa sin warnings en los 3 Dockerfiles.
- [ ] `dive` muestra score > 90% (eficiencia de capas).
- [ ] `Makefile` con targets `build`, `test`, `push`, `scan`.

### Referencias día 1

- [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [BuildKit features](https://docs.docker.com/build/buildkit/)
- [Distroless images](https://github.com/GoogleContainerTools/distroless)
- [Dive - layer analysis](https://github.com/wagoodman/dive)