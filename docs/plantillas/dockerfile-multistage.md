# Dockerfile Multi-stage (Producción)

> **Uso**: **Recomendado para producción**. Builder → Runtime optimizado.

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# {{SERVICE_NAME}} - Multi-stage Dockerfile
# =============================================================================

# ---- Build Arguments ----
ARG BASE_IMAGE={{BASE_IMAGE}}
ARG BUILDER_IMAGE={{BUILDER_IMAGE}}
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

# Build args disponibles en este stage
ARG APP_VERSION
{{BUILD_SECRETS}}

WORKDIR /app

# ---- Cache de dependencias ----
COPY {{DEP_FILES}} ./
RUN {{DEPS_CACHE_MOUNT}} \
    {{INSTALL_DEPS_CMD}}

# ---- Copiar código y build ----
COPY . .
RUN {{BUILD_CMD}}

# ---- Tests (fallan el build si fallan) ----
RUN {{TEST_CMD}}

# =============================================================================
# STAGE 2: RUNTIME
# =============================================================================
FROM ${BASE_IMAGE} AS runtime

# ---- Metadata OCI ----
LABEL \
  org.opencontainers.image.title="{{SERVICE_NAME}}" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="{{REPO_URL}}" \
  org.opencontainers.image.description="{{DESCRIPTION}}" \
  org.opencontainers.image.licenses="{{LICENSE}}"

# ---- Runtime args ----
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
{{RUNTIME_ENVS}}

WORKDIR /app

# ---- Non-root user ----
{{NON_ROOT_USER}}

# ---- Directorios writables para read-only rootfs ----
USER root
RUN mkdir -p {{WRITABLE_DIRS}} && \
    chown -R {{APP_USER}}:{{APP_GROUP}} {{WRITABLE_DIRS}}
USER {{APP_USER}}

# ---- Copiar solo artefactos de producción ----
COPY --from=builder --chown={{APP_USER}}:{{APP_GROUP}} {{COPY_FROM_BUILDER}} ./

EXPOSE {{PORT}}

HEALTHCHECK --interval=30s --timeout=3s --start-period={{HEALTH_START_PERIOD}}s --retries=3 \
  CMD {{HEALTHCHECK_CMD}}

ENTRYPOINT ["{{ENTRYPOINT_CMD}}"]
CMD ["{{CMD_ARGS}}"]
```

## Placeholders a reemplazar

| Placeholder | Ejemplo Node.js | Ejemplo Python | Ejemplo Go | Descripción |
|-------------|-----------------|----------------|------------|-------------|
| `{{SERVICE_NAME}}` | `taskflow-api` | `taskflow-worker` | `taskflow-frontend` | Nombre servicio |
| `{{BASE_IMAGE}}` | `node:20-alpine` | `python:3.12-alpine` | `alpine:3.20` | Imagen runtime |
| `{{BUILDER_IMAGE}}` | `node:20-alpine` | `python:3.12-alpine` | `golang:1.22-alpine` | Imagen builder |
| `{{REPO_URL}}` | `https://github.com/org/repo` | | | URL repo |
| `{{DESCRIPTION}}` | `API REST para TaskFlow` | | | Descripción |
| `{{LICENSE}}` | `MIT` | | | Licencia |
| `{{DEP_FILES}}` | `package*.json` | `pyproject.toml` | `go.mod go.sum` | Archivos deps |
| `{{INSTALL_DEPS_CMD}}` | `npm ci --only=production` | `pip install --no-cache-dir --prefix=/install .` | `go mod download` | Instalar deps |
| `{{DEPS_CACHE_MOUNT}}` | `--mount=type=cache,target=/root/.npm` | `--mount=type=cache,target=/root/.cache/pip` | `--mount=type=cache,target=/go/pkg/mod` | Cache mount |
| `{{BUILD_CMD}}` | `npm run build` | `pip install --no-cache-dir --prefix=/install .` | `CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/server .` | Build |
| `{{TEST_CMD}}` | `npm test` | `pytest` | `go test ./...` | Tests |
| `{{BUILD_SECRETS}}` | `ARG NPM_TOKEN\nRUN --mount=type=secret,id=npm_token npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)"` | `ARG PYPI_TOKEN\nRUN --mount=type=secret,id=pypi_token pip config set ...` | (raro en Go) | Build secrets |
| `{{RUNTIME_ENVS}}` | `ENV NODE_ENV=production` | `ENV PYTHON_ENV=production` | (ninguno) | Env vars runtime |
| `{{NON_ROOT_USER}}` | `RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser` | `RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser` | `RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser` | Crear usuario |
| `{{APP_USER}}` | `appuser` | `appuser` | `appuser` | Usuario runtime |
| `{{APP_GROUP}}` | `appgroup` | `appgroup` | `appgroup` | Grupo runtime |
| `{{WRITABLE_DIRS}}` | `/tmp/app /var/run/app /var/cache/app` | `/tmp/app /var/run/app` | `/tmp /var/run` | Dirs writables |
| `{{COPY_FROM_BUILDER}}` | `/app/node_modules /app/dist /app/package.json` | `/install /app/src` | `/app/server` | Qué copiar |
| `{{PORT}}` | `3000` | `8000` | `8080` | Puerto |
| `{{HEALTH_START_PERIOD}}` | `10` | `15` | `5` | Segundos gracia |
| `{{HEALTHCHECK_CMD}}` | `node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"` | `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"` | `wget -qO- http://localhost:8080/healthz` | Healthcheck |
| `{{ENTRYPOINT_CMD}}` | `node` | `python` | `/server` | Entrypoint |
| `{{CMD_ARGS}}` | `["dist/server.js"]` | `["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` | `[]` | Args por defecto |

## Ejemplo completo: Node.js API

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow API - Multi-stage Dockerfile
# =============================================================================

ARG NODE_VERSION=20
ARG BASE_IMAGE=node:${NODE_VERSION}-alpine
ARG BUILDER_IMAGE=node:${NODE_VERSION}-alpine
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

ARG APP_VERSION
ARG NPM_TOKEN

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)" \
    && npm ci --only=production

COPY . .
RUN npm run build
RUN npm test

# =============================================================================
# STAGE 2: RUNTIME
# =============================================================================
FROM ${BASE_IMAGE} AS runtime

LABEL \
  org.opencontainers.image.title="TaskFlow API" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="API REST para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

USER root
RUN mkdir -p /tmp/app /var/run/app /var/cache/app && \
    chown -R appuser:appgroup /tmp/app /var/run/app /var/cache/app
USER appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"

ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

## Ejemplo completo: Python Worker (Distroless)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow Worker - Multi-stage + Distroless
# =============================================================================

ARG PYTHON_VERSION=3.12
ARG BASE_IMAGE=gcr.io/distroless/python3-debian12
ARG BUILDER_IMAGE=python:${PYTHON_VERSION}-alpine
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev

COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --prefix=/install .

COPY src/ ./src/
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --prefix=/install .

# =============================================================================
# STAGE 2: RUNTIME (Distroless)
# =============================================================================
FROM ${BASE_IMAGE} AS runtime

LABEL \
  org.opencontainers.image.title="TaskFlow Worker" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="Worker async para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --from=builder /app/src ./src

USER nonroot:nonroot

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os; import redis; r=redis.from_url(os.getenv('REDIS_URL','redis://redis:6379')); r.ping()" || exit 1

ENTRYPOINT ["python", "-m", "celery", "-A", "worker.tasks", "worker", "--loglevel=info", "--concurrency=4"]
```

## Ejemplo completo: Go Frontend (Scratch)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow Frontend - Multi-stage + Scratch
# =============================================================================

ARG GO_VERSION=1.22
ARG BASE_IMAGE=scratch
ARG BUILDER_IMAGE=golang:${GO_VERSION}-alpine
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w -X main.version=${APP_VERSION}" -o /app/server .

# =============================================================================
# STAGE 2: RUNTIME (Scratch)
# =============================================================================
FROM ${BASE_IMAGE} AS runtime

LABEL \
  org.opencontainers.image.title="TaskFlow Frontend" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="Frontend Go para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /app/server /server

USER 1000:1000

EXPOSE 8080

ENTRYPOINT ["/server"]
```

## Checklist validación

```bash
# 1. Hadolint
hadolint --failure-threshold=warning Dockerfile

# 2. Build multi-arch
docker buildx build --platform linux/amd64,linux/arm64 -t {{REGISTRY}}/{{SERVICE}}:{{TAG}} --push .

# 3. Verificar multi-arch
docker manifest inspect {{REGISTRY}}/{{SERVICE}}:{{TAG}}

# 4. Verificar non-root
docker run --rm {{IMAGE}} id | grep -q "uid=1001"

# 4. Verificar read-only
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=50m {{IMAGE}} touch /tmp/ok

# 5. Verificar healthcheck
docker run -d --name test {{IMAGE}}
sleep 10
docker inspect test --format '{{.State.Health.Status}}' | grep -q healthy
docker rm -f test

# 6. Dive score
dive --ci {{IMAGE}}
```