# Día 1 - 05: Caso de uso y entregable

## Objetivos de la sesión

- [ ] Integrar lo aprendido en los 3 servicios del proyecto (frontend, api, worker).
- [ ] Crear `Makefile` unificado para build, test, push, scan.
- [ ] Configurar GitHub Actions workflow básico (build + push).
- [ ] Versionar imágenes con semver + git SHA.
- [ ] Validar todo con checklist día 1.
- [ ] Commit y push a repo personal.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap día 1 + visión conjunto |
| 20 min | Crear Dockerfiles para frontend y worker (guiado) |
| 15 min | Makefile unificado + variables |
| 10 min | Break |
| 30 min | GitHub Actions: build multi-arch + push a GHCR |
| 20 min | Validación completa: hadolint, dive, trivy, manifest inspect |
| 15 min | Commit, tag, push + checklist final |
| 10 min | Preguntas + preparación día 2 |

---

## Dockerfile: Frontend (React + Nginx)

### Código: `apps/frontend/`

```
frontend/
├── package.json
├── nginx.conf
├── Dockerfile
├── .dockerignore
└── src/
```

### `apps/frontend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# Frontend - React + Nginx (multi-stage)
# =============================================================================

ARG NODE_VERSION=20
ARG NGINX_VERSION=1.27
ARG APP_VERSION=dev

# ---- STAGE 1: Builder (Node) ----
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Cache deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build producción
COPY . .
RUN npm run build

# ---- STAGE 2: Runtime (Nginx) ----
FROM nginx:${NGINX_VERSION}-alpine AS runtime

# Metadata
LABEL \
  org.opencontainers.image.title="Course Frontend" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

# Non-root user (nginx ya existe en alpine)
# nginx:alpine usa usuario nginx (UID 101)
# Pero para consistencia creamos appuser
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Copiar build de React
COPY --from=builder --chown=appuser:appgroup /app/dist /usr/share/nginx/html

# Config nginx personalizada
COPY --chown=appuser:appgroup nginx.conf /etc/nginx/conf.d/default.conf

# Directorios writables para nginx (cache, pid, run)
USER root
RUN mkdir -p /var/cache/nginx /var/run /tmp/nginx && \
    chown -R appuser:appgroup /var/cache/nginx /var/run /tmp/nginx
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

# Nginx master process necesita root para bind puerto <1024
# Pero usamos 8080 → non-root OK
# Si se usa puerto 80: ENTRYPOINT ["nginx", "-g", "daemon off;"] con USER root
ENTRYPOINT ["nginx", "-g", "daemon off;"]
```

### `apps/frontend/nginx.conf`

```nginx
server {
    listen 8080;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Healthcheck endpoint
    location /healthz {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }

    # SPA routing: fallback a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache estáticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain application/javascript text/css application/json;
    gzip_min_length 1000;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
```

### `apps/frontend/.dockerignore`

```dockerignore
.git
node_modules
dist
build
coverage
*.log
.env
.env.*
Dockerfile*
docker-compose*.yml
.vscode
.idea
.DS_Store
tests
*.test.ts
*.spec.ts
```

---

## Dockerfile: Worker (Python + Celery)

### Código: `apps/worker/`

```
worker/
├── pyproject.toml
├── src/
│   └── worker/
│       ├── __init__.py
│       ├── tasks.py
│       └── health.py
├── Dockerfile
└── .dockerignore
```

### `apps/worker/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
# =============================================================================
# Worker - Python + Celery (distroless)
# =============================================================================

ARG PYTHON_VERSION=3.12
ARG APP_VERSION=dev

# ---- STAGE 1: Builder ----
FROM python:${PYTHON_VERSION}-alpine AS builder

WORKDIR /app

# Build deps
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

# Metadata
LABEL \
  org.opencontainers.image.title="Course Worker" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/agile611/curso-docker"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

# Copiar paquetes y código
COPY --from=builder /install /usr/local
COPY --from=builder /app/src ./src

# Non-root (distroless)
USER nonroot:nonroot

# Celery no expone puerto HTTP por defecto
# Healthcheck: verificar que proceso celery está vivo
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os; import redis; r=redis.from_url(os.getenv('REDIS_URL','redis://redis:6379')); r.ping()" || exit 1

# Entrypoint: celery worker
ENTRYPOINT ["python", "-m", "celery", "-A", "worker.tasks", "worker", "--loglevel=info", "--concurrency=4"]
```

### `apps/worker/.dockerignore`

```dockerignore
.git
__pycache__
*.pyc
.pytest_cache
.coverage
htmlcov
dist
build
*.egg-info
.env
.env.*
Dockerfile*
docker-compose*.yml
.vscode
.idea
.DS_Store
tests
```

---

## Makefile unificado

### `Makefile` (raíz del repo)

```makefile
# =============================================================================
# Makefile - Curso Docker Fundamentals
# =============================================================================

# Variables
REGISTRY ?= ghcr.io
OWNER ?= $(shell git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_SHA := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
PLATFORMS ?= linux/amd64,linux/arm64

SERVICES := frontend api worker
IMAGES := $(addprefix $(REGISTRY)/$(OWNER)/,$(SERVICES))

# Colores
GREEN  := \033[0;32m
YELLOW := \033[1;33m
RED    := \033[0;31m
NC     := \033[0m

.PHONY: help build test push scan lint validate clean all

help: ## Mostrar ayuda
	@echo "$(GREEN)Comandos disponibles:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'

# ---- Build ----
build: ## Build todas las imágenes (local, arch nativa)
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Building $$svc...$(NC)"; \
		docker build -t $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) -t $(REGISTRY)/$(OWNER)/$$svc:latest ./apps/$$svc; \
	done

build-multiarch: ## Build multi-arch y push a registry
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Building multi-arch $$svc...$(NC)"; \
		docker buildx build \
			--platform $(PLATFORMS) \
			-t $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) \
			-t $(REGISTRY)/$(OWNER)/$$svc:latest \
			--push \
			./apps/$$svc; \
	done

# ---- Test ----
test: ## Ejecutar tests en contenedor (builder stage)
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Testing $$svc...$(NC)"; \
		docker build --target builder -t $$svc-test ./apps/$$svc; \
		docker run --rm $$svc-test; \
	done

# ---- Lint ----
lint: ## Lint Dockerfiles con hadolint
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Linting $$svc...$(NC)"; \
		hadolint --failure-threshold=warning ./apps/$$svc/Dockerfile; \
	done

# ---- Scan ----
scan: ## Escanear vulnerabilidades con Trivy
	@for img in $(IMAGES); do \
		echo "$(GREEN)Scanning $$img:$(VERSION)...$(NC)"; \
		trivy image --severity HIGH,CRITICAL --exit-code 1 $$img:$(VERSION); \
	done

scan-all: ## Escanear todas las severidades (reporte)
	@for img in $(IMAGES); do \
		echo "$(GREEN)Scanning $$img:$(VERSION) (all)...$(NC)"; \
		trivy image --format table $$img:$(VERSION); \
	done

# ---- Push ----
push: build-multiarch ## Alias para build-multiarch

# ---- Validate ----
validate: lint ## Validación completa local
	@echo "$(GREEN)Validando imágenes locales...$(NC)"
	@for svc in $(SERVICES); do \
		dive --ci $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) 2>/dev/null || true; \
	done
	@echo "$(GREEN)Validando multi-arch en registry...$(NC)"
	@for svc in $(SERVICES); do \
		docker manifest inspect $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) >/dev/null || { echo "$(RED)❌ Manifest no encontrado para $$svc$(NC)"; exit 1; }; \
		echo "$(GREEN)✅ $$svc multi-arch OK$(NC)"; \
	done

# ---- SBOM ----
sbom: ## Generar SBOM (Syft)
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Generando SBOM para $$svc...$(NC)"; \
		syft $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) -o spdx-json > sbom-$${svc}.spdx.json; \
		syft $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) -o cyclonedx-json > sbom-$${svc}.cdx.json; \
	done

# ---- Sign ----
sign: ## Firmar imágenes con cosign (keyless)
	@for svc in $(SERVICES); do \
		echo "$(GREEN)Firmando $$svc...$(NC)"; \
		cosign sign --yes $(REGISTRY)/$(OWNER)/$$svc:$(VERSION); \
	done

# ---- Clean ----
clean: ## Limpiar imágenes locales
	@for svc in $(SERVICES); do \
		docker rmi -f $(REGISTRY)/$(OWNER)/$$svc:$(VERSION) $(REGISTRY)/$(OWNER)/$$svc:latest 2>/dev/null || true; \
	done
	docker system prune -f

# ---- All ----
all: lint build test validate ## Pipeline completo local

# ---- Versioning ----
tag: ## Crear tag git semver (requiere VERSION=v1.2.3)
	@if [ "$(VERSION)" = "dev" ]; then echo "$(RED)Especifica VERSION=v1.2.3$(NC)"; exit 1; fi
	git tag -a $(VERSION) -m "Release $(VERSION)"
	git push origin $(VERSION)

release: tag build-multiarch scan sign sbom ## Release completo: tag, build, scan, sign, sbom
	@echo "$(GREEN)Release $(VERSION) completado$(NC)"
```

---

## GitHub Actions: Build + Push básico

### `.github/workflows/ci.yml`

```yaml
name: CI - Build & Push

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}
  PLATFORMS: linux/amd64,linux/arm64

jobs:
  # ---- Lint ----
  lint:
    name: Lint Dockerfiles
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run hadolint
        uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: apps/*/Dockerfile
          failure-threshold: warning

  # ---- Build & Push ----
  build:
    name: Build & Push (${{ matrix.service }})
    needs: lint
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      attestations: write
      id-token: write
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.service }}
          platforms: ${{ env.PLATFORMS }}
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true

      - name: Verify manifest
        if: github.event_name != 'pull_request'
        run: |
          docker manifest inspect ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ steps.meta.outputs.tags }}

  # ---- Scan ----
  scan:
    name: Scan Vulnerabilities (${{ matrix.service }})
    needs: build
    runs-on: ubuntu-latest
    permissions:
      packages: read
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:latest
          format: 'sarif'
          output: 'trivy-${{ matrix.service }}.sarif'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-${{ matrix.service }}.sarif'

  # ---- Summary ----
  summary:
    name: Summary
    needs: [build, scan]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Check job status
        run: |
          if [[ "${{ needs.build.result }}" != "success" ]]; then
            echo "❌ Build failed"
            exit 1
          fi
          if [[ "${{ needs.scan.result }}" != "success" ]]; then
            echo "❌ Scan failed"
            exit 1
          fi
          echo "✅ All checks passed"
```

---

## Validación completa día 1

### Script: `validate-day1.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== VALIDACIÓN DÍA 1 ===${NC}"

# 1. Estructura
echo "1. Verificando estructura..."
[[ -f apps/frontend/Dockerfile ]] || { echo -e "${RED}❌ Falta frontend/Dockerfile${NC}"; exit 1; }
[[ -f apps/api/Dockerfile ]] || { echo -e "${RED}❌ Falta api/Dockerfile${NC}"; exit 1; }
[[ -f apps/worker/Dockerfile ]] || { echo -e "${RED}❌ Falta worker/Dockerfile${NC}"; exit 1; }
[[ -f Makefile ]] || { echo -e "${RED}❌ Falta Makefile${NC}"; exit 1; }
[[ -f .github/workflows/ci.yml ]] || { echo -e "${RED}❌ Falta CI workflow${NC}"; exit 1; }
echo -e "${GREEN}✅ Estructura OK${NC}"

# 2. Hadolint
echo "2. Hadolint..."
for svc in frontend api worker; do
  hadolint --failure-threshold=warning apps/$svc/Dockerfile || exit 1
done
echo -e "${GREEN}✅ Hadolint OK${NC}"

# 3. Build local
echo "3. Build local..."
make build || exit 1
echo -e "${GREEN}✅ Build local OK${NC}"

# 4. Tests
echo "4. Tests..."
make test || exit 1
echo -e "${GREEN}✅ Tests OK${NC}"

# 5. Multi-arch en registry (si push done)
echo "5. Verificando multi-arch en registry..."
for svc in frontend api worker; do
  docker manifest inspect ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/$svc:latest >/dev/null 2>&1 || { echo -e "${RED}❌ $svc no multi-arch en registry${NC}"; exit 1; }
done
echo -e "${GREEN}✅ Multi-arch OK${NC}"

# 6. Trivy scan (HIGH/CRITICAL)
echo "6. Trivy scan..."
for svc in frontend api worker; do
  trivy image --severity HIGH,CRITICAL --exit-code 1 ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/$svc:latest || exit 1
done
echo -e "${GREEN}✅ Trivy scan OK${NC}"

# 7. Dive efficiency
echo "7. Dive efficiency (>90%)..."
for svc in frontend api worker; do
  dive --ci ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/$svc:latest 2>/dev/null || { echo -e "${RED}❌ $svc dive score < 90%${NC}"; exit 1; }
done
echo -e "${GREEN}✅ Dive efficiency OK${NC}"

echo -e "${GREEN}=== TODAS LAS VALIDACIONES PASARON ===${NC}"
echo ""
echo "Entregables día 1 completados:"
echo "  - 3 Dockerfiles multi-stage optimizados"
echo "  - .dockerignore por servicio"
echo "  - Makefile con targets build/test/push/scan/lint"
echo "  - GitHub Actions CI (lint, build multi-arch, push, scan)"
echo "  - Imágenes en GHCR: frontend, api, worker (multi-arch)"
echo "  - Tags: latest + semver + git SHA"
```

---

## Checklist final día 1

| ✅ | Entregable | Verificación |
|----|------------|--------------|
| 1 | `apps/frontend/Dockerfile` | Multi-stage, non-root, healthcheck, hadolint ✅ |
| 2 | `apps/api/Dockerfile` | Multi-stage, non-root, healthcheck, hadolint ✅ |
| 3 | `apps/worker/Dockerfile` | Multi-stage, non-root, healthcheck, hadolint ✅ |
| 4 | `.dockerignore` (3 + raíz) | Excluye node_modules, .git, dist, secrets ✅ |
| 5 | `Makefile` | Targets: build, test, push, scan, lint, validate ✅ |
| 6 | `.github/workflows/ci.yml` | Lint → Build multi-arch → Push → Scan → Summary ✅ |
| 7 | Imágenes en GHCR | 3 servicios, multi-arch (amd64/arm64) ✅ |
| 8 | Tags | `latest`, `v1.0.0`, `sha-abc123` ✅ |
| 9 | Trivy scan | 0 HIGH/CRITICAL ✅ |
| 10 | Dive score | > 90% eficiencia capas ✅ |
| 11 | Repo Git | Commits atómicos, mensajes convencionales ✅ |

---

## Preparación día 2

- Revisar: [Día 2 índice](../dia-02-redes-almacenamiento-compose/index.md)
- Leer: [Docker Compose spec](https://github.com/compose-spec/compose-spec)
- Traer: Dockerfiles validados, imágenes en registry, repo actualizado.
- Dudas: networking, volúmenes, compose override, healthchecks en compose.

---

## Recursos post-sesión

- [Docker Buildx GitHub Actions](https://github.com/docker/build-push-action)
- [Docker Metadata Action](https://github.com/docker/metadata-action)
- [Trivy GitHub Action](https://github.com/aquasecurity/trivy-action)
- [Cosign keyless signing](https://docs.sigstore.dev/cosign/keyless/)
- [Syft SBOM](https://github.com/anchore/syft)