# Día 1 - 04: Taller de prompts Dockerfile

## Objetivos de la sesión

- [ ] Practicar escritura de Dockerfiles para 3 stacks distintos.
- [ ] Comparar enfoques: alpine vs debian-slim vs distroless vs scratch.
- [ ] Optimizar capas y cache en escenarios reales.
- [ ] Depurar builds fallidos: `docker build --progress=plain`, `dive`.
- [ ] Aplicar linting y validación automática.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap + presentación de 3 retos |
| 15 min | Reto 1: App Go (binario estático) → scratch |
| 15 min | Reto 2: App Python (FastAPI) → distroless |
| 15 min | Reto 3: App Java (Spring Boot) → eclipse-temurin + jlink |
| 10 min | Break |
| 30 min | Laboratorio autónomo: cada participante elige 1 reto + variante |
| 20 min | Comparativa resultados: tamaño, capas, tiempo build, hadolint |
| 10 min | Preguntas + checkpoint |

---

## Reto 1: Go - Binario estático → scratch

### Código proporcionado (`apps/go-service/main.go`)

```go
package main

import (
    "fmt"
    "net/http"
    "os"
    "time"
)

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        fmt.Fprintln(w, "OK")
    })

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Go Service v%s\n", os.Getenv("APP_VERSION"))
    })

    srv := &http.Server{
        Addr:         ":" + port,
        ReadTimeout:  5 * time.Second,
        WriteTimeout: 10 * time.Second,
    }

    fmt.Printf("Starting on :%s\n", port)
    if err := srv.ListenAndServe(); err != nil {
        fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
        os.Exit(1)
    }
}
```

### Dockerfile objetivo (scratch)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# Go Service - Scratch (binario estático)
# =============================================================================

ARG GO_VERSION=1.22
ARG APP_VERSION=dev

# ---- STAGE 1: Builder ----
FROM golang:${GO_VERSION}-alpine AS builder

WORKDIR /src

# Cache de módulos
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Build estático
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w -X main.version=${APP_VERSION}" -o /app/server .

# ---- STAGE 2: Runtime (scratch) ----
FROM scratch AS runtime

# Certificados CA para HTTPS saliente
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Timezone data (opcional)
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Binario
COPY --from=builder /app/server /server

# Non-root user (UID 1000 en scratch no existe, pero documentamos)
USER 1000:1000

EXPOSE 8080

# Healthcheck: en scratch no hay curl/nc, usar binario o TCP dial desde Go
# Opción: compilar healthcheck en el binario o usar kubernetes probe
# Aquí: sin HEALTHCHECK en imagen (se hace en orquestador)

ENTRYPOINT ["/server"]
```

### Puntos clave Go + scratch

| Aspecto | Detalle |
|---------|---------|
| `CGO_ENABLED=0` | Obligatorio para binario estático puro |
| `-ldflags="-s -w"` | Strip symbols + debug info (reduce ~30%) |
| `ca-certificates.crt` | Necesario para TLS saliente (APIs externas) |
| `zoneinfo` | Necesario si app usa `time.LoadLocation` |
| No hay shell | No `sh`, no `ls`, no `ps` → debugging con `kubectl debug` |
| Usuario | `USER 1000:1000` numérico (no hay `/etc/passwd`) |

### Build y test

```bash
cd apps/go-service

# Build multi-arch
docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/usuario/go-service:v1.0.0 --push .

# Test local (solo arch nativa)
docker build -t go-service:test .
docker run --rm -p 8080:8080 go-service:test &
sleep 3
curl -f http://localhost:8080/healthz
curl http://localhost:8080/
docker stop $(docker ps -q --filter ancestor=go-service:test)

# Análisis tamaño
docker image inspect go-service:test --format '{{.Size}}' | numfmt --to=iec
# Esperado: ~10-15 MB
```

---

## Reto 2: Python (FastAPI) → distroless

### Código proporcionado (`apps/python-service/`)

```
python-service/
├── pyproject.toml
├── src/
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       └── health.py
└── tests/
    └── test_health.py
```

`pyproject.toml`:
```toml
[project]
name = "python-service"
version = "1.0.0"
dependencies = [
    "fastapi==0.109.*",
    "uvicorn[standard]==0.27.*",
    "pydantic==2.5.*",
]

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"
```

### Dockerfile objetivo (distroless Python)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# Python Service - Distroless
# =============================================================================

ARG PYTHON_VERSION=3.12
ARG APP_VERSION=dev

# ---- STAGE 1: Builder ----
FROM python:${PYTHON_VERSION}-alpine AS builder

WORKDIR /app

# Instalar build deps
RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev

# Cache pip
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --prefix=/install .

# Copiar código
COPY src/ ./src/
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --prefix=/install .

# ---- STAGE 2: Runtime (distroless) ----
FROM gcr.io/distroless/python3-debian12 AS runtime

WORKDIR /app

# Copiar paquetes instalados
COPY --from=builder /install /usr/local

# Copiar código
COPY --from=builder /app/src ./src

# Non-root (distroless usa nonroot:nonroot = 65532:65532)
USER nonroot:nonroot

EXPOSE 8000

# Healthcheck: distroless tiene python pero no curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

# Entrypoint: uvicorn
ENTRYPOINT ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Puntos clave Python + distroless

| Aspecto | Detalle |
|---------|---------|
| `--prefix=/install` | Instala en ubicación conocida para copiar |
| `gcr.io/distroless/python3-debian12` | Incluye Python + stdlib, sin pip, sin shell |
| `USER nonroot:nonroot` | UID 65532 predefinido |
| Healthcheck | Usa `python -c "urllib..."` (no curl) |
| Tamaño | ~80-100 MB vs ~300 MB `python:3.12-slim` |

### Build y test

```bash
cd apps/python-service

docker build -t python-service:test .
docker run --rm -p 8000:8000 python-service:test &
sleep 5
curl -f http://localhost:8000/healthz
curl http://localhost:8000/
docker stop $(docker ps -q --filter ancestor=python-service:test)

docker image inspect python-service:test --format '{{.Size}}' | numfmt --to=iec
# Esperado: ~80-100 MB
```

---

## Reto 3: Java (Spring Boot) → eclipse-temurin + jlink

### Código proporcionado (`apps/java-service/`)

```
java-service/
├── pom.xml
├── src/
│   └── main/
│       ├── java/com/example/Application.java
│       └── resources/application.yml
└── Dockerfile (vacío - crear)
```

### Dockerfile objetivo (jlink custom JRE)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# Java Service - Custom JRE with jlink
# =============================================================================

ARG JAVA_VERSION=21
ARG MAVEN_VERSION=3.9
ARG APP_VERSION=dev

# ---- STAGE 1: Builder (Maven) ----
FROM maven:${MAVEN_VERSION}-eclipse-temurin-${JAVA_VERSION}-alpine AS builder

WORKDIR /app

# Cache deps
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -B

# Build
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -B

# ---- STAGE 2: JRE Builder (jlink) ----
FROM eclipse-temurin:${JAVA_VERSION}-jdk-alpine AS jre-builder

# Crear JRE mínimo con módulos necesarios
# spring-boot necesita: java.base, java.logging, java.xml, java.sql, java.naming, java.desktop, java.management, java.security.jgss, java.instrument
RUN $JAVA_HOME/bin/jlink \
    --add-modules java.base,java.logging,java.xml,java.sql,java.naming,java.desktop,java.management,java.security.jgss,java.instrument \
    --strip-debug \
    --no-header-files \
    --no-man-pages \
    --compress=2 \
    --output /jre-minimal

# ---- STAGE 3: Runtime ----
FROM alpine:3.20 AS runtime

# Copiar JRE mínimo
COPY --from=jre-builder /jre-minimal /opt/java/jre-minimal
ENV JAVA_HOME=/opt/java/jre-minimal
ENV PATH=$JAVA_HOME/bin:$PATH

WORKDIR /app

# Non-root
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Copiar jar (spring-boot fat jar)
COPY --from=builder --chown=appuser:appgroup /app/target/*.jar app.jar

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
```

### Puntos clave Java + jlink

| Aspecto | Detalle |
|---------|---------|
| `jlink` | Crea JRE solo con módulos necesarios (~40-50 MB vs ~200 MB full JDK) |
| `--strip-debug` | Elimina info debug |
| `--compress=2` | Compresión ZIP |
| Módulos | Identificar con `jdeps --print-module-deps app.jar` |
| Alpine + JRE | Funciona (musl compatible con JDK 17+) |
| `MaxRAMPercentage` | Respeta límites cgroup |

### Build y test

```bash
cd apps/java-service

docker build -t java-service:test .
docker run --rm -p 8080:8080 -m 512m java-service:test &
sleep 30  # Java startup más lento
curl -f http://localhost:8080/actuator/health
docker stop $(docker ps -q --filter ancestor=java-service:test)

docker image inspect java-service:test --format '{{.Size}}' | numfmt --to=iec
# Esperado: ~120-150 MB (vs ~400 MB con JDK completo)
```

---

## Laboratorio autónomo: Elige tu aventura

### Opción A: Variantes del mismo servicio

Toma el Dockerfile del servicio `api` (Node.js) y crea 3 variantes:

1. **Alpine estándar** (como en sesión 1.3)
2. **Debian slim** (`node:20-slim`) - comparar tamaño y vulnerabilidades
3. **Distroless** (`gcr.io/distroless/nodejs20-debian12`) - sin shell

### Opción B: Nuevo servicio - Rust

Crea Dockerfile para app Rust (Axum/Actix) con:
- Builder: `rust:1.75-alpine` + `cargo chef` para cache deps
- Runtime: `alpine:3.20` o `distroless/cc-debian12` o `scratch`

### Opción C: Optimización extrema

Toma cualquier Dockerfile y aplica:
- `dive` para identificar capas desperdiciadas
- Reordenar instrucciones para max cache
- Cache mounts para gestor de paquetes
- `.dockerignore` agresivo
- Medir: tiempo build (cold/warm), tamaño final, hadolint score

---

## Comparativa esperada (resultados típicos)

| Stack | Base | Tamaño final | Build time (cold) | Build time (warm) | Hadolint |
|-------|------|--------------|-------------------|-------------------|----------|
| Go | scratch | 12 MB | 45s | 8s | ✅ |
| Python | distroless | 95 MB | 120s | 25s | ✅ |
| Java | jlink + alpine | 130 MB | 180s | 40s | ✅ |
| Node.js | alpine | 180 MB | 90s | 15s | ✅ |
| Node.js | distroless | 95 MB | 90s | 15s | ✅ |

---

## Checkpoint validación

```bash
# validate.sh lab-1-4
#!/usr/bin/env bash
set -euo pipefail

echo "1. Al menos 1 Dockerfile nuevo creado..."
find apps -name 'Dockerfile*' -newer apps/api/Dockerfile | grep -q . || { echo "❌ No hay Dockerfile nuevo"; exit 1; }

echo "2. Hadolint pasa en nuevos..."
for df in $(find apps -name 'Dockerfile*' -newer apps/api/Dockerfile); do
  hadolint --failure-threshold=warning "$df" || exit 1
done

echo "3. Imagen buildable..."
for df in $(find apps -name 'Dockerfile*' -newer apps/api/Dockerfile); do
  dir=$(dirname "$df")
  docker build -t "test-$(basename $dir)" "$dir" || exit 1
done

echo "✅ Checkpoint 1.4 superado"
```

---

## Recursos post-sesión

- [Go container best practices](https://go.dev/doc/docker)
- [Python distroless guide](https://github.com/GoogleContainerTools/distroless/blob/main/python/README.md)
- [Java jlink tutorial](https://docs.oracle.com/en/java/javase/17/jlink/introduction-jlink.html)
- [Spring Boot container images](https://spring.io/guides/topicals/spring-boot-docker/)
- [Rust docker layer caching](https://github.com/LukeMathWalker/cargo-chef)