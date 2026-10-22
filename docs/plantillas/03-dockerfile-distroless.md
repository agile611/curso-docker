# Dockerfile Distroless (Google)

> **Uso**: Máxima seguridad, tamaño mínimo. Runtime sin shell, sin package manager, sin usuarios root.

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# {{SERVICE_NAME}} - Distroless Dockerfile
# =============================================================================

ARG BASE_IMAGE={{DISTROLESS_IMAGE}}
ARG BUILDER_IMAGE={{BUILDER_IMAGE}}
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

WORKDIR /app

{{BUILDER_DEPS}}

COPY {{DEP_FILES}} ./
RUN {{DEPS_CACHE_MOUNT}} \
    {{INSTALL_DEPS_CMD}}

COPY . .
RUN {{BUILD_CMD}}
RUN {{TEST_CMD}}

# =============================================================================
# STAGE 2: RUNTIME (Distroless)
# =============================================================================
FROM ${BASE_IMAGE} AS runtime

LABEL \
  org.opencontainers.image.title="{{SERVICE_NAME}}" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="{{REPO_URL}}" \
  org.opencontainers.image.description="{{DESCRIPTION}}" \
  org.opencontainers.image.licenses="{{LICENSE}}"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
{{RUNTIME_ENVS}}

WORKDIR /app

{{COPY_FROM_BUILDER}}

USER nonroot:nonroot

EXPOSE {{PORT}}

HEALTHCHECK --interval=30s --timeout=3s --start-period={{HEALTH_START_PERIOD}}s --retries=3 \
  CMD {{HEALTHCHECK_CMD}}

ENTRYPOINT ["{{ENTRYPOINT_CMD}}"]
CMD ["{{CMD_ARGS}}"]
```

## Imágenes Distroless disponibles

| Lenguaje | Imagen | Usuario por defecto | Tamaño aprox |
|----------|--------|---------------------|--------------|
| **Node.js** | `gcr.io/distroless/nodejs20-debian12` | `nonroot:nonroot` (65532) | ~95 MB |
| **Python** | `gcr.io/distroless/python3-debian12` | `nonroot:nonroot` | ~85 MB |
| **Java** | `gcr.io/distroless/java17-debian12` | `nonroot:nonroot` | ~120 MB |
| **Go/C++** | `gcr.io/distroless/cc-debian12` | `nonroot:nonroot` | ~25 MB |
| **Static** | `gcr.io/distroless/static-debian12` | `nonroot:nonroot` | ~10 MB |
| **Base** | `gcr.io/distroless/base-debian12` | `nonroot:nonroot` | ~15 MB |

## Placeholders específicos Distroless

| Placeholder | Ejemplo Node.js | Ejemplo Python | Ejemplo Java | Descripción |
|-------------|-----------------|----------------|--------------|-------------|
| `{{DISTROLESS_IMAGE}}` | `gcr.io/distroless/nodejs20-debian12` | `gcr.io/distroless/python3-debian12` | `gcr.io/distroless/java17-debian12` | Imagen distroless |
| `{{BUILDER_IMAGE}}` | `node:20-alpine` | `python:3.12-alpine` | `eclipse-temurin:17-jdk-alpine` | Imagen builder |
| `{{BUILDER_DEPS}}` | (ninguno) | `RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev` | `RUN apk add --no-cache maven` | Deps builder |
| `{{INSTALL_DEPS_CMD}}` | `npm ci --only=production` | `pip install --no-cache-dir --prefix=/install .` | `mvn dependency:go-offline -B` | Instalar deps |
| `{{DEPS_CACHE_MOUNT}}` | `--mount=type=cache,target=/root/.npm` | `--mount=type=cache,target=/root/.cache/pip` | `--mount=type=cache,target=/root/.m2` | Cache mount |
| `{{BUILD_CMD}}` | `npm run build` | `pip install --no-cache-dir --prefix=/install .` | `mvn package -DskipTests -B` | Build |
| `{{COPY_FROM_BUILDER}}` | `COPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/package.json ./` | `COPY --from=builder /install /usr/local\nCOPY --from=builder /app/src ./src` | `COPY --from=builder /app/target/*.jar app.jar` | Artefactos |
| `{{HEALTHCHECK_CMD}}` | `node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"` | `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"` | `wget -qO- http://localhost:8080/actuator/health \| grep -q '"status":"UP'"` | Healthcheck |
| `{{ENTRYPOINT_CMD}}` | `node` | `python` | `java` | Entrypoint |
| `{{CMD_ARGS}}` | `["dist/server.js"]` | `["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` | `["-XX:MaxRAMPercentage=75", "-jar", "app.jar"]` | Args |

## Ejemplo completo: Node.js API

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow API - Distroless
# =============================================================================

ARG NODE_VERSION=20
ARG BASE_IMAGE=gcr.io/distroless/nodejs20-debian12
ARG BUILDER_IMAGE=node:${NODE_VERSION}-alpine
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

WORKDIR /app

ARG NPM_TOKEN
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)"

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

COPY . .
RUN npm run build
RUN npm test

# =============================================================================
# STAGE 2: RUNTIME (Distroless)
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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

USER nonroot:nonroot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"

ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

## Ejemplo completo: Python API

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow API - Python Distroless
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
  org.opencontainers.image.title="TaskFlow API" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="API REST para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV PYTHON_ENV=production

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --from=builder /app/src ./src

USER nonroot:nonroot

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

ENTRYPOINT ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Ejemplo completo: Java Spring Boot

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow API - Java Distroless (con jlink custom JRE)
# =============================================================================

ARG JAVA_VERSION=17
ARG MAVEN_VERSION=3.9
ARG BASE_IMAGE=gcr.io/distroless/java17-debian12
ARG BUILDER_IMAGE=eclipse-temurin:${JAVA_VERSION}-jdk-alpine
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER (Maven)
# =============================================================================
FROM maven:${MAVEN_VERSION}-${BUILDER_IMAGE} AS builder

WORKDIR /app

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -B

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -B

# =============================================================================
# STAGE 2: JRE BUILDER (jlink)
# =============================================================================
FROM eclipse-temurin:${JAVA_VERSION}-jdk-alpine AS jre-builder

RUN $JAVA_HOME/bin/jlink \
    --add-modules java.base,java.logging,java.xml,java.sql,java.naming,java.desktop,java.management,java.security.jgss,java.instrument \
    --strip-debug \
    --no-header-files \
    --no-man-pages \
    --compress=2 \
    --output /jre-minimal

# =============================================================================
# STAGE 3: RUNTIME (Distroless Java)
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

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

USER nonroot:nonroot

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
```

## Comparativa tamaños

| Stack | Alpine | Distroless | Scratch (Go) | Ahorro vs Alpine |
|-------|--------|------------|--------------|------------------|
| Node.js API | ~180 MB | ~95 MB | N/A | **47%** |
| Python API | ~300 MB | ~85 MB | N/A | **72%** |
| Java Spring | ~400 MB | ~120 MB | N/A | **70%** |
| Go Service | ~15 MB | ~25 MB (cc) | ~12 MB | N/A |

## Consideraciones importantes

### ⚠️ Limitaciones Distroless

| Limitación | Impacto | Mitigación |
|------------|---------|------------|
| **Sin shell** (`sh`, `bash`) | No `docker exec -it sh` | `kubectl debug -it --image=busybox` |
| **Sin package manager** | No `apk`, `apt`, `pip` en runtime | Todo en builder stage |
| **Sin usuarios root** | `USER nonroot:nonroot` fijo | Configurar en builder |
| **Sin `ca-certificates` en base** | TLS saliente falla | Copiar desde builder: `COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/` |
| **Sin `tzdata`** | Timezone issues | Copiar: `COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo` |

### Debugging en Distroless

```bash
# Opción 1: kubectl debug (recomendado K8s)
kubectl debug -it pod/api-xxx --image=busybox --target=api -n production

# Opción 2: Docker debug (local)
docker run -it --rm --entrypoint sh {{IMAGE}}  # NO funciona en distroless

# Opción 3: Sidecar debug container (K8s)
# Añadir al pod template:
# - name: debug
#   image: busybox
#   command: ["sleep", "infinity"]
# Luego: kubectl exec -it pod/api-xxx -c debug -- sh
```

### Cuándo usar Distroless vs Scratch vs Alpine

| Criterio | Alpine | Distroless | Scratch |
|----------|--------|------------|---------|
| **Lenguaje** | Cualquiera | Node, Python, Java, Go | Solo Go/Rust estáticos |
| **Tamaño** | Medio | Pequeño | Mínimo |
| **Debugging** | Fácil (`sh`) | Difícil (`kubectl debug`) | Muy difícil |
| **Compatibilidad** | Total | Alta (glibc) | Solo estáticos |
| **Seguridad** | Buena | **Máxima** | **Máxima** |
| **Recomendado** | Desarrollo, legacy | **Producción estándar** | Go/Rust microservicios |