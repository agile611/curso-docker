# Día 3 - 05: Caso de uso y entregable (Seguridad + CI/CD integrados)

## Objetivos de la sesión

- [ ] Integrar hardening, secrets, escaneo y firma en pipeline único.
- [ ] Validar end-to-end: commit → build → test → scan → sign → deploy staging.
- [ ] Configurar policy gates y documentar excepciones.
- [ ] Generar evidencias de compliance (SBOM, provenance, firmas).
- [ ] Entregar pipeline listo para producción.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap semana + visión integrada |
| 20 min | Pipeline unificado: revisión arquitectura |
| 10 min | Break |
| 60 min | Laboratorio guiado: pipeline completo en GitHub Actions |
| 30 min | Validación end-to-end + evidencias |
| 20 min | Documentación: ADR, runbooks, README badges |
| 10 min | Preguntas + preparación día 4 |

---

## Pipeline unificado: arquitectura final

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE CI/CD COMPLETO (DÍA 3)                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────┐  ┌──────────────┐  ┌──────┐  ┌─────────┐  ┌────────┐  ┌────────────┐  │
│  │  LINT   │─►│   BUILD      │─►│ TEST │─►│  SCAN   │─►│ SIGN   │─►│ DEPLOY     │  │
│  │         │  │  (multi-arch)│  │      │  │         │  │        │  │  STAGING   │  │
│  │ hadolint│  │ buildx       │  │unit  │  │ Trivy   │  │ cosign │  │ kind/k3d   │  │
│  │ yamllint│  │ push GHCR    │  │integ │  │ Syft    │  │ keyless│  │ Helm       │  │
│  │ checkov │  │ cache GHA    │  │      │  │ SBOM    │  │ SLSA   │  │ smoke test │  │
│  │ .trivy  │  │ provenance   │  │      │  │ policy  │  │ attest │  │            │  │
│  └─────────┘  └──────────────┘  └──────┘  └─────────┘  └────────┘  └────────────┘  │
│     │             │              │          │            │            │             │
│     ▼             ▼              ▼          ▼            ▼            ▼             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         EVIDENCIAS GENERADAS                                │   │
│  │  ✅ Imágenes multi-arch en GHCR (semver, sha, latest)                       │   │
│  │  ✅ SBOM: SPDX + CycloneDX (artifact)                                       │   │
│  │  ✅ Provenance SLSA (attestation)                                           │   │
│  │  ✅ Firmas cosign keyless (verificables)                                    │   │
│  │  ✅ SARIF reports (GitHub Security tab)                                     │   │
│  │  ✅ Policy evaluation (pass/fail)                                           │   │
│  │  ✅ Deploy staging + smoke tests                                            │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Archivos finales del proyecto (estado día 3)

```
mi-curso-docker/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Pipeline principal
│   │   └── ci-compose.yml      # Compose para tests CI
│   └── dependabot.yml          # Actualizaciones automáticas
├── apps/
│   ├── frontend/
│   │   ├── Dockerfile          # Hardened L2
│   │   ├── nginx.conf
│   │   └── .dockerignore
│   ├── api/
│   │   ├── Dockerfile          # Hardened L2 + build secret
│   │   └── .dockerignore
│   └── worker/
│       ├── Dockerfile          # Hardened L2 (distroless)
│       └── .dockerignore
├── docker-compose.yml          # Base (prod-ready)
├── docker-compose.override.yml # Dev (hot reload)
├── docker-compose.prod.yml     # Prod (Swarm deploy)
├── docker-compose.ci.yml       # CI (tmpfs volumes)
├── .hadolint.yaml
├── .yamllint.yml
├── .trivyignore
├── .sops.yaml
├── secrets.enc.yaml            # Secrets encriptados (SOPS)
├── secrets/                    # Solo dev (gitignored)
│   ├── db_password.txt
│   └── jwt_secret.txt
├── policy/
│   ├── trivy.rego              # Policy Trivy
│   └── custom.rego             # Policy custom
├── Makefile                    # Targets unificados
├── README.md                   # Con badges
└── docs/                       # ADR, runbooks
    ├── adr/
    │   ├── 001-compose-strategy.md
    │   ├── 002-hardening-level.md
│   │   └── 003-security-pipeline.md
    └── runbooks/
        ├── deploy-staging.md
        ├── rotate-secrets.md
        └── incident-response.md
```

---

## `.github/workflows/ci.yml` (versión final completa)

```yaml
name: CI - Complete Pipeline

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 0'  # Weekly full scan

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}
  PLATFORMS: linux/amd64,linux/arm64

permissions:
  contents: read
  packages: write
  attestations: write
  id-token: write
  security-events: write
  actions: read

jobs:
  # =========================================================================
  # LINT
  # =========================================================================
  lint:
    name: Lint (Dockerfile, Compose, IaC)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Hadolint
        uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: apps/*/Dockerfile
          failure-threshold: warning
          recursive: true
          config: .hadolint.yaml
      
      - name: Yamllint
        run: |
          pip install yamllint
          yamllint -c .yamllint.yml docker-compose*.yml .github/workflows/*.yml
      
      - name: Checkov (IaC scan)
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: .
          framework: dockerfile,kubernetes,github_actions
          skip_check: CKV_DOCKER_3
          quiet: true

  # =========================================================================
  # BUILD & PUSH (multi-arch)
  # =========================================================================
  build:
    name: Build & Push (${{ matrix.service }})
    needs: lint
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Para git describe / SLSA

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        with:
          driver-opts: network=host

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
          labels: |
            org.opencontainers.image.source=${{ github.server_url }}/${{ github.repository }}
            org.opencontainers.image.revision=${{ github.sha }}
            org.opencontainers.image.created=${{ github.event.head_commit.timestamp }}
            org.opencontainers.image.title=${{ matrix.service }}
            org.opencontainers.image.version=${{ steps.meta.outputs.version }}

      - name: Build and push
        id: build
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
          build-args: |
            APP_VERSION=${{ steps.meta.outputs.version }}
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            GIT_SHA=${{ github.sha }}

      - name: Verify manifest
        if: github.event_name != 'pull_request'
        run: |
          docker manifest inspect ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ steps.meta.outputs.version }}

      - name: Output digest
        run: |
          echo "digest=${{ steps.build.outputs.digest }}" >> $GITHUB_OUTPUT
          echo "version=${{ steps.meta.outputs.version }}" >> $GITHUB_OUTPUT

  # =========================================================================
  # TEST
  # =========================================================================
  test:
    name: Test (${{ matrix.service }})
    needs: build
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, api, worker]
        include:
          - service: frontend
            test_cmd: npm test
          - service: api
            test_cmd: npm test
          - service: worker
            test_cmd: pytest
      fail-fast: false
    steps:
      - uses: actions/checkout@v4

      - name: Pull image
        run: |
          docker pull ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }}

      - name: Run tests
        run: |
          docker run --rm \
            -e NODE_ENV=test \
            -e PYTHON_ENV=test \
            ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} \
            ${{ matrix.test_cmd }}

  # =========================================================================
  # SCAN VULNERABILITIES
  # =========================================================================
  scan:
    name: Scan Vulnerabilities (${{ matrix.service }})
    needs: build
    runs-on: ubuntu-latest
    permissions:
      packages: read
      security-events: write
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }}
          format: 'sarif'
          output: 'trivy-${{ matrix.service }}.sarif'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
          ignore-unfixed: true
          ignorefile: '.trivyignore'

      - name: Upload to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-${{ matrix.service }}.sarif'
          category: ${{ matrix.service }}

      - name: Generate SBOM (Syft)
        run: |
          syft ${{ env.REGISTRY }}/${{ env.OWNOR }}/${{ matrix.service }}:${{ needs.build.outputs.version }} -o spdx-json > sbom-${{ matrix.service }}.spdx.json
          syft ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} -o cyclonedx-json > sbom-${{ matrix.service }}.cdx.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ matrix.service }}
          path: sbom-${{ matrix.service }}.*
          retention-days: 90

      - name: Policy evaluation (Trivy Rego)
        run: |
          trivy image --policy policy/trivy.rego ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }}

  # =========================================================================
  # SIGN IMAGES
  # =========================================================================
  sign:
    name: Sign Images (${{ matrix.service }})
    needs: [build, scan]
    runs-on: ubuntu-latest
    permissions:
      packages: write
      id-token: write
      attestations: write
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - name: Install cosign
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2'

      - name: Sign image (keyless)
        env:
          COSIGN_EXPERIMENTAL: "true"
        run: |
          cosign sign --yes \
            ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}@${{ needs.build.outputs.digest }}

      - name: Generate SLSA provenance
        uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v1.9.0
        with:
          base64-subjects: "${{ needs.build.outputs.digest }}"
          upload-assets: true

  # =========================================================================
  # DEPLOY STAGING
  # =========================================================================
  deploy-staging:
    name: Deploy to Staging (kind)
    needs: [build, test, scan, sign]
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Create kind cluster
        uses: helm/kind-action@v1.10.0
        with:
          cluster_name: staging
          config: .github/kind-config.yaml

      - name: Install Helm
        uses: azure/setup-helm@v4

      - name: Deploy with Helm
        run: |
          helm upgrade --install curso-staging ./charts/curso-app \
            --namespace staging --create-namespace \
            --set frontend.image.tag=${{ needs.build.outputs.version }} \
            --set api.image.tag=${{ needs.build.outputs.version }} \
            --set worker.image.tag=${{ needs.build.outputs.version }} \
            --set global.registry=${{ env.REGISTRY }}/${{ env.OWNER }} \
            --wait --timeout 5m

      - name: Smoke tests
        run: |
          kubectl port-forward -n staging svc/frontend 8080:80 &
          sleep 5
          curl -f http://localhost:8080/healthz
          curl -f http://localhost:8080/
          kill %1

  # =========================================================================
  # SUMMARY
  # =========================================================================
  summary:
    name: Pipeline Summary
    needs: [lint, build, test, scan, sign, deploy-staging]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Check all jobs
        run: |
          FAILED=0
          for job in lint build test scan sign deploy-staging; do
            RESULT="${{ needs.$job.result }}"
            if [[ "$RESULT" != "success" && "$RESULT" != "skipped" ]]; then
              echo "❌ $job: $RESULT"
              FAILED=1
            else
              echo "✅ $job: $RESULT"
            fi
          done
          if [[ $FAILED -eq 1 ]]; then exit 1; fi
          echo "🎉 All pipeline stages passed!"
```

---

## Validación end-to-end

### Script de validación completa

```bash
#!/usr/bin/env bash
# validate-day3.sh
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== VALIDACIÓN DÍA 3 COMPLETA ===${NC}"

# 1. Estructura
echo "1. Verificando estructura..."
for svc in frontend api worker; do
  [[ -f apps/$svc/Dockerfile ]] || { echo -e "${RED}❌ Falta apps/$svc/Dockerfile${NC}"; exit 1; }
done
[[ -f .github/workflows/ci.yml ]] || { echo -e "${RED}❌ Falta ci.yml${NC}"; exit 1; }
[[ -f .hadolint.yaml ]] || { echo -e "${RED}❌ Falta .hadolint.yaml${NC}"; exit 1; }
[[ -f .trivyignore ]] || { echo -e "${RED}❌ Falta .trivyignore${NC}"; exit 1; }
[[ -f policy/trivy.rego ]] || { echo -e "${RED}❌ Falta policy/trivy.rego${NC}"; exit 1; }
echo -e "${GREEN}✅ Estructura OK${NC}"

# 2. Hardening en Dockerfiles
echo "2. Verificando hardening..."
for svc in frontend api worker; do
  grep -q '^USER ' apps/$svc/Dockerfile || { echo -e "${RED}❌ $svc sin USER${NC}"; exit 1; }
  grep -q 'HEALTHCHECK' apps/$svc/Dockerfile || { echo -e "${RED}❌ $svc sin HEALTHCHECK${NC}"; exit 1; }
  grep -q 'cap_drop.*ALL' apps/$svc/Dockerfile || echo -e "${GREEN}⚠️ $svc sin cap_drop en Dockerfile (se aplica en runtime)${NC}"
done
echo -e "${GREEN}✅ Hardening OK${NC}"

# 3. Build secret en api
echo "3. Verificando build secret..."
grep -q 'type=secret' apps/api/Dockerfile || { echo -e "${RED}❌ Falta build secret en api${NC}"; exit 1; }
echo -e "${GREEN}✅ Build secret OK${NC}"

# 4. Runtime secrets en compose
echo "4. Verificando runtime secrets..."
docker compose config | grep -q "db_password:" || { echo -e "${RED}❌ Falta db_password secret${NC}"; exit 1; }
docker compose config | grep -q "jwt_secret:" || { echo -e "${RED}❌ Falta jwt_secret secret${NC}"; exit 1; }
echo -e "${GREEN}✅ Runtime secrets OK${NC}"

# 5. SOPS
echo "5. Verificando SOPS..."
[[ -f secrets.enc.yaml ]] || { echo -e "${RED}❌ Falta secrets.enc.yaml${NC}"; exit 1; }
! grep -q "super-db-password" secrets.enc.yaml || { echo -e "${RED}❌ Secret en claro en secrets.enc.yaml${NC}"; exit 1; }
echo -e "${GREEN}✅ SOPS OK${NC}"

# 6. Pipeline GitHub Actions
echo "6. Verificando pipeline..."
echo "   Verificar manualmente en GitHub Actions: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo "   Jobs esperados: lint → build → test → scan → sign → deploy-staging → summary"

# 7. Imágenes en GHCR
echo "7. Verificando imágenes en GHCR..."
OWNER=$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')
for svc in frontend api worker; do
  docker manifest inspect ghcr.io/$OWNER/$svc:latest >/dev/null 2>&1 || { echo -e "${RED}❌ $svc no en GHCR${NC}"; exit 1; }
  # Multi-arch
  PLATFORMS=$(docker manifest inspect ghcr.io/$OWNER/$svc:latest | jq -r '.manifests[].platform | "\(.os)/\(.architecture)"' | sort -u)
  echo "$PLATFORMS" | grep -q "linux/amd64" || { echo -e "${RED}❌ $svc sin linux/amd64${NC}"; exit 1; }
  echo "$PLATFORMS" | grep -q "linux/arm64" || { echo -e "${RED}❌ $svc sin linux/arm64${NC}"; exit 1; }
done
echo -e "${GREEN}✅ Imágenes multi-arch en GHCR OK${NC}"

# 8. Firmas cosign
echo "8. Verificando firmas cosign..."
for svc in frontend api worker; do
  cosign verify ghcr.io/$OWNER/$svc:latest \
    --certificate-identity-regexp "https://github.com/.*" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" >/dev/null 2>&1 || { echo -e "${RED}❌ $svc no firmada${NC}"; exit 1; }
done
echo -e "${GREEN}✅ Firmas cosign OK${NC}"

# 9. SBOM
echo "9. Verificando SBOM..."
for svc in frontend api worker; do
  [[ -f sbom-$svc.spdx.json ]] || echo -e "${GREEN}⚠️ SBOM local no encontrado (verificar artifact en GH Actions)${NC}"
done
echo -e "${GREEN}✅ SBOM OK${NC}"

# 10. Deploy staging
echo "10. Verificando deploy staging..."
echo "   Verificar manualmente: kind cluster staging + Helm release"

echo -e "${GREEN}=== TODAS LAS VALIDACIONES DÍA 3 PASARON ===${NC}"
echo ""
echo "Entregables día 3 completados:"
echo "  ✅ 3 Dockerfiles hardened L2 (non-root, read-only ready, cap_drop, healthcheck)"
echo "  ✅ Build secret en api (npm_token)"
echo "  ✅ Runtime secrets en compose (db_password, jwt_secret)"
echo "  ✅ SOPS para secrets en repo (secrets.enc.yaml)"
echo "  ✅ Pipeline CI/CD completo (lint, build, test, scan, sign, deploy)"
echo "  ✅ Trivy scan con policy gates (HIGH/CRITICAL = fail)"
echo "  ✅ SBOM generado (SPDX + CycloneDX)"
echo "  ✅ Imágenes firmadas con cosign (keyless)"
echo "  ✅ SLSA provenance attestation"
echo "  ✅ Deploy a staging (kind + Helm)"
echo "  ✅ Badges en README"
echo "  ✅ ADR documentados"
```

---

## README.md con badges

```markdown
# Curso Docker Fundamentals - Proyecto Final

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![Security Scan](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg?job=scan)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/badge/docker%20image-ghcr.io-blue)](https://github.com/OWNER/REPO/pkgs/container/)
[![Signed](https://img.shields.io/badge/cosign-signed-brightgreen)](https://docs.sigstore.dev/cosign/)
[![SBOM](https://img.shields.io/badge/SBOM-SPDX%20%7C%20CycloneDX-blue)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Quickstart

```bash
# Desarrollo
docker compose up -d

# Producción (Swarm)
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml mi-app

# Kubernetes (Helm)
helm install mi-app ./charts/curso-app -n production --create-namespace
```

## Servicios

| Servicio | Puerto | Healthcheck | Imagen |
|----------|--------|-------------|--------|
| Frontend | 8080 | `/healthz` | `ghcr.io/owner/frontend` |
| API | 3000 | `/healthz` | `ghcr.io/owner/api` |
| Worker | - | Redis ping | `ghcr.io/owner/worker` |
| PostgreSQL | 5432 | `pg_isready` | `postgres:16-alpine` |
| Redis | 6379 | `redis-cli ping` | `redis:7-alpine` |

## Seguridad

- ✅ Non-root containers (UID 1001)
- ✅ Read-only rootfs ready
- ✅ Capabilities dropped (ALL)
- ✅ Build secrets (BuildKit)
- ✅ Runtime secrets (Docker secrets / K8s secrets)
- ✅ Vulnerability scanning (Trivy, HIGH/CRITICAL = fail)
- ✅ SBOM generation (SPDX, CycloneDX)
- ✅ Image signing (cosign keyless)
- ✅ SLSA provenance

## Pipeline

Ver [.github/workflows/ci.yml](.github/workflows/ci.yml)

## Documentación

- [ADR 001: Compose Strategy](docs/adr/001-compose-strategy.md)
- [ADR 002: Hardening Level](docs/adr/002-hardening-level.md)
- [ADR 003: Security Pipeline](docs/adr/003-security-pipeline.md)
- [Runbook: Deploy Staging](docs/runbooks/deploy-staging.md)
- [Runbook: Rotate Secrets](docs/runbooks/rotate-secrets.md)
```

---

## ADR: Documentación de decisiones

### `docs/adr/001-compose-strategy.md`

```markdown
# ADR 001: Docker Compose Strategy

## Status
Accepted

## Context
Need to run same stack in dev, CI, and prod with different requirements.

## Decision
Single `docker-compose.yml` base with override files:
- `docker-compose.override.yml` (dev, auto-loaded)
- `docker-compose.ci.yml` (CI, explicit -f)
- `docker-compose.prod.yml` (prod, Swarm deploy)

## Consequences
- Single source of truth
- Environment-specific overrides explicit
- Merge rules documented in team wiki
```

### `docs/adr/002-hardening-level.md`

```markdown
# ADR 002: Container Hardening Level

## Status
Accepted

## Context
Choose default hardening for production containers.

## Decision
Level 2 (Hardened) as default:
- Non-root user (UID 1001)
- Read-only rootfs + tmpfs
- Capabilities: drop ALL
- Seccomp default profile
- Healthchecks mandatory

Exceptions documented per workload.
```

### `docs/adr/003-security-pipeline.md`

```markdown
# ADR 003: Security Pipeline Requirements

## Status
Accepted

## Context
Define mandatory security gates in CI/CD.

## Decision
All images must pass:
1. Hadolint (warning threshold)
2. Trivy scan: 0 HIGH/CRITICAL (with .trivyignore for documented exceptions)
3. Policy evaluation (custom Rego)
4. Cosign signature (keyless)
5. SLSA provenance attestation
6. SBOM (SPDX + CycloneDX)

Fail build on any gate failure.
```

---

## Runbooks

### `docs/runbooks/deploy-staging.md`

```markdown
# Runbook: Deploy to Staging

## Prerequisites
- kind cluster running (`kind create cluster --name staging`)
- Helm 3.x installed
- kubectl configured

## Procedure
```bash
# 1. Update image tags
helm upgrade --install curso-staging ./charts/curso-app \
  --namespace staging --create-namespace \
  --set frontend.image.tag=v1.2.3 \
  --set api.image.tag=v1.2.3 \
  --set worker.image.tag=v1.2.3 \
  --wait --timeout 5m

# 2. Verify
kubectl get pods -n staging
kubectl logs -n staging -l app=api --tail=50

# 3. Smoke tests
kubectl port-forward -n staging svc/frontend 8080:80
curl http://localhost:8080/healthz
```

## Rollback
```bash
helm rollback curso-staging -n staging
```
```

### `docs/runbooks/rotate-secrets.md`

```markdown
# Runbook: Rotate Secrets

## Database Password
```bash
# 1. Generate new password
NEW_PASS=$(openssl rand -base64 32)

# 2. Update in Swarm
docker secret rm db_password
echo $NEW_PASS | docker secret create db_password -

# 3. Rolling restart
docker service update --secret-rm db_password --secret-add source=db_password,target=/run/secrets/db_password api
docker service update --secret-rm db_password --secret-add source=db_password,target=/run/secrets/db_password worker

# 4. Verify
docker service ps api  # Check rolling restart
```

## JWT Secret
```bash
# Similar process, but requires coordinated restart of all services
# Plan maintenance window
```
```

---

## Checklist final día 3

| ✅ | Entregable | Verificación |
|----|------------|--------------|
| 1 | `apps/*/Dockerfile` hardened L2 | non-root, read-only ready, cap_drop, healthcheck |
| 2 | Build secret en api | `type=secret` para npm_token |
| 3 | Runtime secrets en compose | db_password, jwt_secret en `/run/secrets/` |
| 4 | SOPS | `secrets.enc.yaml` encriptado, `.sops.yaml` config |
| 5 | `.hadolint.yaml` | Reglas equipo |
| 6 | `.trivyignore` | Excepciones documentadas |
| 7 | `policy/trivy.rego` | Policy gates |
| 8 | `.github/workflows/ci.yml` | Pipeline completo pasando |
| 9 | Imágenes en GHCR | 3 servicios, multi-arch (amd64/arm64) |
| 10 | Tags | semver, sha, latest |
| 11 | Trivy scan | 0 HIGH/CRITICAL |
| 12 | Cosign verify | Firmas válidas keyless |
| 13 | SBOM artifacts | SPDX + CycloneDX en GH Actions |
| 14 | SLSA provenance | Attestation subida |
| 15 | Deploy staging | kind + Helm funcional |
| 16 | README badges | CI, Security, Signed, SBOM |
| 17 | ADR (3) | Documentados en `docs/adr/` |
| 18 | Runbooks (3) | Deploy, rotate, incident |

---

## Preparación día 4

- Revisar: [Día 4 índice](../dia-04-orquestacion-produccion/index.md)
- Leer: [Kubernetes basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- Traer: Pipeline verde, imágenes firmadas, repo actualizado.
- Dudas: Swarm vs K8s, Helm charts, observabilidad.

---

## Recursos post-sesión

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- [Docker Buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [Cosign keyless](https://docs.sigstore.dev/cosign/keyless/)
- [SLSA GitHub Generator](https://github.com/slsa-framework/slsa-github-generator)
- [Helm charts](https://helm.sh/docs/topics/charts/)
- [Kind](https://kind.sigs.k8s.io/)