# Dockerfile Base (Single-stage)

> **Uso**: Desarrollo, apps simples, learning. **NO para producción**.

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# {{SERVICE_NAME}} - Base Dockerfile (single-stage)
# =============================================================================

ARG BASE_IMAGE={{BASE_IMAGE}}
ARG APP_VERSION=dev

FROM ${BASE_IMAGE}

# Metadata
LABEL \
  org.opencontainers.image.title="{{SERVICE_NAME}}" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="{{REPO_URL}}" \
  org.opencontainers.image.description="{{DESCRIPTION}}"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

WORKDIR /app

# Instalar dependencias del sistema (si needed)
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     {{SYSTEM_DEPS}} \
#  && rm -rf /var/lib/apt/lists/*

# Copiar archivos de dependencias
COPY {{DEP_FILES}} ./

# Instalar dependencias de la app
RUN {{INSTALL_CMD}}

# Copiar código fuente
COPY . .

# Build (si aplica)
# RUN {{BUILD_CMD}}

# Usuario no-root (recomendado incluso en dev)
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
USER appuser

EXPOSE {{PORT}}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD {{HEALTHCHECK_CMD}}

ENTRYPOINT ["{{ENTRYPOINT_CMD}}"]
CMD ["{{CMD_ARGS}}"]
```

## Placeholders a reemplazar

| Placeholder | Ejemplo | Descripción |
|-------------|---------|-------------|
| `{{SERVICE_NAME}}` | `taskflow-api` | Nombre del servicio |
| `{{BASE_IMAGE}}` | `node:20-alpine` | Imagen base con tag fijo |
| `{{REPO_URL}}` | `https://github.com/org/repo` | URL repositorio |
| `{{DESCRIPTION}}` | `API REST para TaskFlow` | Descripción corta |
| `{{DEP_FILES}}` | `package*.json` | Archivos de dependencias |
| `{{INSTALL_CMD}}` | `npm ci` | Comando instalar deps |
| `{{BUILD_CMD}}` | `npm run build` | Comando build (opcional) |
| `{{PORT}}` | `3000` | Puerto expuesto |
| `{{HEALTHCHECK_CMD}}` | `node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"` | Comando healthcheck |
| `{{ENTRYPOINT_CMD}}` | `node` | Ejecutable principal |
| `{{CMD_ARGS}}` | `["dist/server.js"]` | Argumentos por defecto |
| `{{SYSTEM_DEPS}}` | `curl ca-certificates` | Deps sistema (opcional) |

## Ejemplo: Node.js API

```dockerfile
# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=node:20-alpine
ARG APP_VERSION=dev

FROM ${BASE_IMAGE}

LABEL \
  org.opencontainers.image.title="TaskFlow API" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="API REST para TaskFlow"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"

ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

## ⚠️ Limitaciones vs Multi-stage

| Aspecto | Base (single-stage) | Multi-stage |
|---------|---------------------|-------------|
| Tamaño imagen | Grande (incluye build tools) | Pequeño (solo runtime) |
| Cache deps | Se invalida con cualquier cambio de código | Separado: deps cacheadas |
| Seguridad | Dev tools en imagen final | Solo runtime deps |
| Build time | Más lento (sin cache granular) | Más rápido (cache layers) |
| **Uso recomendado** | Solo desarrollo/local | **Producción** |