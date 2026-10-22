# Dockerfile Scratch (Go/Rust binarios estáticos)

> **Uso**: **Máximo minimalismo**. Solo para binarios estáticos compilados (Go, Rust, C++). Sin libc, sin nada.

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# {{SERVICE_NAME}} - Scratch Dockerfile (binario estático)
# =============================================================================

ARG BUILDER_IMAGE={{BUILDER_IMAGE}}
ARG BASE_IMAGE=scratch
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER
# =============================================================================
FROM ${BUILDER_IMAGE} AS builder

WORKDIR /src

{{BUILDER_DEPS}}

COPY {{DEP_FILES}} ./
RUN {{DEPS_CACHE_MOUNT}} \
    {{DOWNLOAD_DEPS_CMD}}

COPY . .
RUN {{BUILD_CMD}}

# =============================================================================
# STAGE 2: RUNTIME (Scratch)
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

{{COPY_CERTS}}
{{COPY_TZDATA}}

COPY --from=builder {{BINARY_PATH}} {{BINARY_DEST}}

USER {{NON_ROOT_UID}}:{{NON_ROOT_GID}}

EXPOSE {{PORT}}

{{HEALTHCHECK}}

ENTRYPOINT ["{{BINARY_DEST}}"]
{{CMD_ARGS}}
```

## Placeholders específicos Scratch

| Placeholder | Ejemplo Go | Ejemplo Rust | Descripción |
|-------------|------------|--------------|-------------|
| `{{BUILDER_IMAGE}}` | `golang:1.22-alpine` | `rust:1.75-alpine` | Imagen builder con toolchain |
| `{{BUILDER_DEPS}}` | (ninguno) | `RUN apk add --no-cache musl-dev` | Deps builder |
| `{{DEP_FILES}}` | `go.mod go.sum` | `Cargo.toml Cargo.lock` | Archivos deps |
| `{{DOWNLOAD_DEPS_CMD}}` | `go mod download` | `cargo fetch` | Descargar deps |
| `{{DEPS_CACHE_MOUNT}}` | `--mount=type=cache,target=/go/pkg/mod \n--mount=type=cache,target=/root/.cache/go-build` | `--mount=type=cache,target=/usr/local/cargo/registry \n--mount=type=cache,target=/app/target` | Cache mount |
| `{{BUILD_CMD}}` | `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X main.version=${APP_VERSION}" -o /app/server .` | `cargo build --release --target x86_64-unknown-linux-musl` | Build estático |
| `{{BINARY_PATH}}` | `/app/server` | `/app/target/x86_64-unknown-linux-musl/release/{{SERVICE_NAME}}` | Path binario |
| `{{BINARY_DEST}}` | `/server` | `/{{SERVICE_NAME}}` | Destino en scratch |
| `{{COPY_CERTS}}` | `COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/` | (igual) | Certificados TLS |
| `{{COPY_TZDATA}}` | `COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo` | (igual) | Timezone data |
| `{{NON_ROOT_UID}}` | `1000` | `1000` | UID numérico (no hay /etc/passwd) |
| `{{NON_ROOT_GID}}` | `1000` | `1000` | GID numérico |
| `{{HEALTHCHECK}}` | `HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \n  CMD wget -qO- http://localhost:8080/healthz || exit 1` | (igual) | Healthcheck HTTP |
| `{{CMD_ARGS}}` | (vacío, entrypoint es el binario) | (vacío) | Args por defecto |

## Ejemplo completo: Go Service

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow Go Service - Scratch
# =============================================================================

ARG GO_VERSION=1.22
ARG BUILDER_IMAGE=golang:${GO_VERSION}-alpine
ARG BASE_IMAGE=scratch
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
FROM scratch AS runtime

LABEL \
  org.opencontainers.image.title="TaskFlow Go Service" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="Go microservice para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

COPY --from=builder /app/server /server

USER 1000:1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/server"]
```

## Ejemplo completo: Rust Service (Axum)

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# TaskFlow Rust Service - Scratch (musl)
# =============================================================================

ARG RUST_VERSION=1.75
ARG BUILDER_IMAGE=rust:${RUST_VERSION}-alpine
ARG BASE_IMAGE=scratch
ARG APP_VERSION=dev

# =============================================================================
# STAGE 1: BUILDER (con cargo-chef para cache deps)
# =============================================================================
FROM ${BUILDER_IMAGE} AS chef
WORKDIR /app
RUN cargo install cargo-chef
COPY Cargo.toml Cargo.lock ./
RUN cargo chef prepare --recipe-path recipe.json

FROM ${BUILDER_IMAGE} AS builder
WORKDIR /app
RUN apk add --no-cache musl-dev
COPY --from=chef /app/recipe.json recipe.json
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --recipe-path recipe.json

COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl

# =============================================================================
# STAGE 2: RUNTIME (Scratch)
# =============================================================================
FROM scratch AS runtime

LABEL \
  org.opencontainers.image.title="TaskFlow Rust Service" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker" \
  org.opencontainers.image.description="Rust microservice para TaskFlow" \
  org.opencontainers.image.licenses="MIT"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/taskflow-rust-service /service

USER 1000:1000

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/service"]
```

## Requisitos para Scratch

### Go
```go
// main.go - Configurar para binario estático
package main

import (
    "net/http"
    "os"
)

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("OK"))
    })
    
    // ... resto de handlers
    
    http.ListenAndServe(":"+port, nil)
}
```

**Build flags obligatorios:**
```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server .
```

- `CGO_ENABLED=0`: Desactiva CGO → binario puramente Go
- `-ldflags="-s -w"`: Strip symbols + debug info (~30% tamaño)
- `GOOS=linux GOARCH=amd64`: Cross-compile explícito

### Rust
```toml
# Cargo.toml - Configurar target musl
[target.x86_64-unknown-linux-musl]
linker = "musl-gcc"

[profile.release]
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

**Target musl obligatorio:**
```bash
rustup target add x86_64-unknown-linux-musl
cargo build --release --target x86_64-unknown-linux-musl
```

## Limitaciones Scratch

| Limitación | Impacto | Solución |
|------------|---------|----------|
| **Sin libc** | Solo binarios estáticos | Go: `CGO_ENABLED=0`, Rust: target `musl` |
| **Sin certificados TLS** | HTTPS saliente falla | `COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/` |
| **Sin timezone data** | `time.LoadLocation` falla | `COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo` |
| **Sin shell** | No debugging interactivo | `kubectl debug` / sidecar |
| **Sin usuarios** | `USER 1000:1000` numérico | Documentar UID/GID |
| **Sin DNS resolver** | `getaddrinfo` puede fallar | Usar IPs o configurar `hosts` |

## Comparativa: Scratch vs Distroless vs Alpine

| Aspecto | Scratch | Distroless | Alpine |
|---------|---------|------------|--------|
| **Tamaño Go** | ~12 MB | ~25 MB (cc) | ~180 MB |
| **Tamaño Rust** | ~8 MB | ~25 MB (cc) | ~150 MB |
| **Shell** | ❌ | ❌ | ✅ (`sh`) |
| **Certificados** | Manual | Incluidos | ✅ |
| **Timezone** | Manual | Incluido | ✅ |
| **Usuarios** | Numérico | `nonroot:nonroot` | ✅ |
| **Debugging** | `kubectl debug` | `kubectl debug` | `docker exec -it sh` |
| **Compatibilidad** | Solo estáticos | Node, Python, Java, Go | Total |
| **Seguridad** | **Máxima** | **Máxima** | Buena |

## Cuándo usar cada uno

| Escenario | Recomendación |
|-----------|---------------|
| **Go microservicio** | **Scratch** (máximo minimalismo) |
| **Rust microservicio** | **Scratch** (musl target) |
| **Node.js/Python/Java** | **Distroless** (no hay scratch para estos) |
| **Legacy app / debugging frecuente** | **Alpine** (o Debian slim) |
| **Máxima seguridad compliance** | **Scratch** (Go/Rust) o **Distroless** |
| **Equipo sin experiencia K8s debug** | **Alpine** (más fácil debugging) |

## Validación Scratch

```bash
# 1. Build
docker buildx build --platform linux/amd64,linux/arm64 -t {{REGISTRY}}/{{SERVICE}}:{{TAG}} --push .

# 2. Verificar tamaño
docker image inspect {{REGISTRY}}/{{SERVICE}}:{{TAG}} --format '{{.Size}}' | numfmt --to=iec
# Debe ser < 20 MB para Go, < 10 MB para Rust

# 3. Verificar non-root (numérico)
docker run --rm {{IMAGE}} id
# uid=1000 gid=1000

# 3. Verificar read-only
docker run --rm --read-only {{IMAGE}} touch /tmp/ok  # Debe funcionar si healthcheck usa /tmp

# 4. Verificar healthcheck
docker run -d --name test {{IMAGE}}
sleep 5
docker inspect test --format '{{.State.Health.Status}}' | grep -q healthy
docker rm -f test

# 5. Verificar TLS saliente (si aplica)
docker run --rm {{IMAGE}} wget -qO- https://google.com  # Debe funcionar si copió certs

# 6. Dive (solo para verificar capas, scratch tiene 1 capa)
dive {{IMAGE}}
```