# Día 3 · Seguridad, buenas prácticas y CI/CD

## Objetivos del día

- [ ] Aplicar hardening de contenedores: non-root, read-only, capabilities, seccomp, AppArmor.
- [ ] Gestionar secrets: build secrets (BuildKit), runtime secrets (Compose/Swarm/K8s), SOPS, Vault.
- [ ] Escanear vulnerabilidades: Docker Scout, Trivy, Syft/Grype, SBOM (SPDX/CycloneDX).
- [ ] Implementar supply chain security: firma de imágenes (cosign), verificación, policy gates.
- [ ] Construir pipeline CI/CD completo: build, test, lint, scan, sign, push multi-arch, deploy staging.

---

## 3.1 Hardening: non-root, read-only, capabilities, seccomp, gVisor/Kata

### Usuario no-root (obligatorio)

```dockerfile
# Alpine
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
USER appuser

# Debian/Ubuntu
RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup -m -s /bin/bash appuser
USER appuser

# Distroless (usuario predefinido)
USER nonroot:nonroot  # UID 65532
```

### Read-only rootfs

```dockerfile
# Dockerfile: preparar directorios writables
USER root
RUN mkdir -p /tmp/app /var/run/app /var/cache/app && \
    chown -R appuser:appgroup /tmp/app /var/run/app /var/cache/app
USER appuser

# Runtime (docker run / compose)
read_only: true
tmpfs:
  - /tmp:rw,noexec,nosuid,size=100m
  - /var/run:rw,size=10m
  - /var/cache/app:rw,size=50m
```

### Capabilities: mínimo necesario

```yaml
# docker-compose.yml / docker run
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE  # Solo si puerto < 1024
  # - CHOWN
  # - SETGID
  # - SETUID
  # - DAC_OVERRIDE
```

| Capability | Descripción | Necesaria? |
|------------|-------------|------------|
| `CAP_NET_BIND_SERVICE` | Bind puertos < 1024 | Solo si puerto 80/443 |
| `CAP_CHOWN` | Cambiar ownership | No (fix en build) |
| `CAP_SETUID`/`CAP_SETGID` | Cambiar UID/GID | No |
| `CAP_DAC_OVERRIDE` | Bypass permisos | No |
| `ALL` (drop) | Eliminar todas | **Sí, siempre** |

### Seccomp: filtrar syscalls

```bash
# Perfil default (docker/default-seccomp.json) bloquea ~44 syscalls peligrosas
# Ver: https://github.com/moby/moby/blob/master/profiles/seccomp/default.json

# Perfil personalizado (más restrictivo)
docker run --security-opt seccomp=/path/custom-seccomp.json mi-imagen
```

```json
// custom-seccomp.json (ejemplo: bloquear mount, reboot, keyctl)
{
  "defaultAction": "SCMP_ACT_ALLOW",
  "syscalls": [
    {"names": ["mount", "umount2", "reboot", "keyctl", "bpf"], "action": "SCMP_ACT_ERRNO"}
  ]
}
```

### AppArmor

```bash
# Perfil default: docker-default (cargado automáticamente)
# Ver: /etc/apparmor.d/docker-default

# Perfil personalizado
docker run --security-opt apparmor=mi-perfil mi-imagen
```

### gVisor / Kata Containers (aislamiento fuerte)

```bash
# gVisor (runsc) - userspace kernel
docker run --runtime=runsc --name mi-app mi-imagen

# Kata Containers (VM ligera) - hardware virtualization
docker run --runtime=kata-runtime --name mi-app mi-imagen
```

| Runtime | Aislamiento | Performance | Caso de uso |
|---------|-------------|-------------|-------------|
| `runc` (default) | Namespaces + cgroups | Nativa | General |
| `runsc` (gVisor) | Userspace kernel (ptrace/kvm) | -10-30% | Multi-tenant, untrusted code |
| `kata-runtime` | Micro-VM (KVM) | -5-15% | Alta seguridad, compliance |

---

## 3.2 Secrets: BuildKit, runtime, SOPS, Vault

### Build Secrets (BuildKit) - NO persisten en imagen

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder
WORKDIR /app

# Secret disponible SOLO durante este RUN
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)" \
    && npm ci --only=production

# Secret para clave SSH (git private repo)
RUN --mount=type=ssh,id=github \
    git clone git@github.com:org/private-repo.git
```

```bash
# Build con secrets
docker build --secret id=npm_token,src=$HOME/.npm_token .
docker build --ssh github=$HOME/.ssh/id_ed25519 .
```

### Runtime Secrets (Compose/Swarm/K8s)

```yaml
# docker-compose.yml (Swarm mode)
secrets:
  db_password:
    external: true
  jwt_secret:
    file: ./secrets/jwt_secret.txt  # Solo dev

services:
  api:
    secrets:
      - source: db_password
        target: /run/secrets/db_password
        mode: 0400
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password
```

```bash
# Swarm: crear secrets
echo "super-secret" | docker secret create db_password -
echo "jwt-key" | docker secret create jwt_secret -

# Kubernetes: kubectl create secret
kubectl create secret generic db-password --from-literal=password=super-secret
```

### SOPS (Secrets OPerationS) - Encriptar archivos

```bash
# Instalar
brew install sops age

# Generar clave age
age-keygen -o age.key

# Encriptar archivo
sops --encrypt --age age1... secrets.yaml > secrets.enc.yaml

# Desencriptar en CI/CD
sops --decrypt --age $AGE_KEY secrets.enc.yaml > secrets.yaml
```

```yaml
# secrets.enc.yaml (encriptado)
db_password: ENC[AES256_GCM,data:...,iv:...,tag:...]
jwt_secret: ENC[AES256_GCM,data:...,iv:...,tag:...]
sops:
  kms: []
  gcp_kms: []
  azure_kv: []
  hc_vault: []
  age:
    - recipient: age1...
      enc: |
        -----BEGIN AGE ENCRYPTED FILE-----
        ...
```

### HashiCorp Vault (intro)

```bash
# Vault agent sidecar pattern (K8s)
# O Vault CLI en pipeline
vault kv get -field=password secret/app/db
```

---

## 3.3 Escaneo: Docker Scout, Trivy, Syft/Grype, SBOM

### Docker Scout (integrado en Docker)

```bash
# Habilitar
docker scout enable

# Escanear imagen local
docker scout cves mi-imagen:tag

# Escanear en registry
docker scout cves ghcr.io/owner/imagen:tag

# Policy evaluation
docker scout policy ghcr.io/owner/imagen:tag

# Dashboard web
docker scout dashboard
```

### Trivy (comprehensive scanner)

```bash
# Instalar
brew install trivy

# Escanear imagen
trivy image --severity HIGH,CRITICAL mi-imagen:tag

# Escanear filesystem
trivy fs --severity HIGH,CRITICAL ./apps/api

# Escanear config (IaC)
trivy config --severity HIGH,CRITICAL ./docker-compose.yml

# Output SARIF para GitHub Security
trivy image --format sarif --output trivy.sarif mi-imagen:tag

# SBOM
trivy image --format spdx-json --output sbom.spdx.json mi-imagen:tag
trivy image --format cyclonedx --output sbom.cdx.json mi-imagen:tag
```

### Syft (SBOM generator) + Grype (vuln scanner)

```bash
# Syft: generar SBOM
syft mi-imagen:tag -o spdx-json > sbom.spdx.json
syft mi-imagen:tag -o cyclonedx-json > sbom.cdx.json
syft mi-imagen:tag -o table

# Grype: escanear SBOM o imagen
grype mi-imagen:tag
grype sbom:sbom.spdx.json
```

### SBOM: SPDX vs CycloneDX

| Formato | Estándar | Herramientas | Uso |
|---------|----------|--------------|-----|
| **SPDX** | Linux Foundation | Syft, Trivy, ORT | Compliance, legal |
| **CycloneDX** | OWASP | Syft, Trivy, CycloneDX tools | Security, supply chain |

```bash
# Comparar
syft mi-imagen:tag -o spdx-json | jq '.packages | length'
syft mi-imagen:tag -o cyclonedx-json | jq '.components | length'
```

---

## 3.4 Supply Chain Security: cosign, SLSA, policy gates

### Firmar imágenes con cosign (keyless)

```bash
# Instalar
brew install cosign

# Firmar (keyless: usa OIDC identity - GitHub Actions, Google, etc.)
cosign sign --yes ghcr.io/owner/imagen:tag

# Verificar
cosign verify ghcr.io/owner/imagen:tag \
  --certificate-identity-regexp "https://github.com/owner/repo" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"

# Firmar con clave (hardware/key file)
cosign sign --key cosign.key ghcr.io/owner/imagen:tag
cosign verify --key cosign.pub ghcr.io/owner/imagen:tag
```

### Attestations (SLSA provenance)

```bash
# Generar attestation de build (provenance)
cosign attest --predicate-type=slsaprovenance \
  --predicate=provenance.json \
  ghcr.io/owner/imagen:tag

# Verificar attestation
cosign verify-attestation --type=slsaprovenance \
  ghcr.io/owner/imagen:tag
```

### Policy Gates (admission control)

```yaml
# Kyverno policy (K8s) - requerir imagen firmada
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-cosign
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - image: "ghcr.io/owner/*"
          key: |-
            -----BEGIN PUBLIC KEY-----
            ...
            -----END PUBLIC KEY-----
```

```yaml
# OPA Gatekeeper / Rego policy
package admission

deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  startswith(image, "ghcr.io/owner/")
  not cosign.verify(image)
  msg := sprintf("Image %v not signed by cosign", [image])
}
```

---

## 3.5 CI/CD: GitHub Actions pipeline completo

### `.github/workflows/ci.yml`

```yaml
name: CI - Build, Test, Scan, Sign, Push

on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 0'  # Weekly scan

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}
  PLATFORMS: linux/amd64,linux/arm64
  VERSION: ${{ github.ref_name == 'main' && 'latest' || github.ref_name }}

permissions:
  contents: read
  packages: write
  attestations: write
  id-token: write
  security-events: write

jobs:
  # =========================================================================
  # LINT
  # =========================================================================
  lint:
    name: Lint Dockerfiles & Compose
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Hadolint
        uses: hadolint/hadolint-action@v3.1.0
        with:
          dockerfile: apps/*/Dockerfile
          failure-threshold: warning
          recursive: true

      - name: Yamllint
        run: |
          pip install yamllint
          yamllint -c .yamllint.yml docker-compose*.yml .github/workflows/*.yml

      - name: Checkov (IaC scan)
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: .
          framework: dockerfile,kubernetes
          skip_check: CKV_DOCKER_3

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

      - name: Verify manifest
        if: github.event_name != 'pull_request'
        run: |
          docker manifest inspect ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ steps.meta.outputs.version }}

      - name: Output digest
        run: |
          echo "digest=${{ steps.build.outputs.digest }}" >> $GITHUB_OUTPUT

  # =========================================================================
  # TEST (en contenedor)
  # =========================================================================
  test:
    name: Test (${{ matrix.service }})
    needs: build
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, api, worker]
      fail-fast: false
    steps:
      - uses: actions/checkout@v4

      - name: Pull test image
        run: |
          docker pull ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }}

      - name: Run tests in container
        run: |
          docker run --rm \
            -e NODE_ENV=test \
            -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test \
            ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} \
            npm test

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

      - name: Upload to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-${{ matrix.service }}.sarif'
          category: ${{ matrix.service }}

      - name: Generate SBOM (Syft)
        run: |
          syft ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} -o spdx-json > sbom-${{ matrix.service }}.spdx.json
          syft ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} -o cyclonedx-json > sbom-${{ matrix.service }}.cdx.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ matrix.service }}
          path: sbom-${{ matrix.service }}.*

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
      - name: Sign with cosign (keyless)
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2'

      - name: Sign image
        env:
          COSIGN_EXPERIMENTAL: "true"
        run: |
          cosign sign --yes \
            ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}@${{ needs.build.outputs.digest }}

      - name: Generate SLSA provenance
        run: |
          cosign attest --predicate-type=slsaprovenance \
            --predicate=<(slsa-github-generator --repository ${{ github.repository }} --workflow ${{ github.workflow }} --ref ${{ github.ref }}) \
            ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}@${{ needs.build.outputs.digest }}

  # =========================================================================
  # DEPLOY STAGING
  # =========================================================================
  deploy-staging:
    name: Deploy to Staging
    needs: [build, test, scan, sign]
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging (kind/k3d)
        run: |
          # Deploy a clúster staging
          kubectl set image deployment/api api=${{ env.REGISTRY }}/${{ env.OWNER }}/api:${{ needs.build.outputs.version }} -n staging
          kubectl set image deployment/frontend frontend=${{ env.REGISTRY }}/${{ env.OWNER }}/frontend:${{ needs.build.outputs.version }} -n staging
          kubectl set image deployment/worker worker=${{ env.REGISTRY }}/${{ env.OWNER }}/worker:${{ needs.build.outputs.version }} -n staging
          kubectl rollout status deployment/api -n staging --timeout=300s
          kubectl rollout status deployment/frontend -n staging --timeout=300s
          kubectl rollout status deployment/worker -n staging --timeout=300s

      - name: Smoke tests
        run: |
          curl -f https://staging.example.com/healthz
          curl -f https://api.staging.example.com/healthz

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
          if [[ "${{ needs.lint.result }}" != "success" ]]; then echo "❌ Lint failed"; exit 1; fi
          if [[ "${{ needs.build.result }}" != "success" ]]; then echo "❌ Build failed"; exit 1; fi
          if [[ "${{ needs.test.result }}" != "success" ]]; then echo "❌ Test failed"; exit 1; fi
          if [[ "${{ needs.scan.result }}" != "success" ]]; then echo "❌ Scan failed"; exit 1; fi
          if [[ "${{ needs.sign.result }}" != "success" ]]; then echo "❌ Sign failed"; exit 1; fi
          if [[ "${{ needs.deploy-staging.result }}" != "success" ]]; then echo "❌ Deploy failed"; exit 1; fi
          echo "✅ All pipeline stages passed"
```

---

## 3.6 Laboratorio 3.1: Hardening + Build Secrets

### Objetivo

Aplicar hardening completo a los 3 Dockerfiles y usar build secret para token npm.

### Pasos

```bash
# 1. Actualizar Dockerfile.api con hardening
cat > apps/api/Dockerfile <<'EOF'
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20
ARG APP_VERSION=dev

# ---- BUILDER ----
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

# Build secret para npm token
ARG NPM_TOKEN
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)"

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

COPY . .
RUN npm run build
RUN npm test

# ---- RUNTIME ----
FROM node:${NODE_VERSION}-alpine AS runtime

LABEL \
  org.opencontainers.image.title="Course API" \
  org.opencontainers.image.version="${APP_VERSION}"

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

WORKDIR /app

# Non-root
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Directorios writables para read-only
USER root
RUN mkdir -p /tmp/app /var/run/app /var/cache/app && \
    chown -R appuser:appgroup /tmp/app /var/run/app /var/cache/app
USER appuser

# Copiar solo producción
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"

ENTRYPOINT ["node"]
CMD ["dist/server.js"]
EOF

# 2. Build con secret (simulado)
echo "fake-npm-token" > /tmp/npm_token
docker build --secret id=npm_token,src=/tmp/npm_token -t api:hardened ./apps/api

# 3. Verificar hardening
docker run --rm --user root api:hardened id  # Debe mostrar uid=1001
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=50m api:hardened touch /tmp/test  # OK
docker run --rm --read-only api:hardened touch /test  # Error: Read-only

# 4. Verificar capabilities
docker run --rm --cap-drop=ALL api:hardened sh -c 'capsh --print' | grep -v "cap_"
```

---

## 3.7 Laboratorio 3.2: Pipeline CI/CD completo

### Objetivo

Ejecutar pipeline completo localmente (act) o en GitHub Actions.

### Usando `act` (local)

```bash
# Instalar act
brew install act

# Ejecutar workflow localmente (requiere Docker daemon)
act -j build -s GITHUB_TOKEN=$(gh auth token) --secret NPM_TOKEN=fake

# O solo lint
act -j lint
```

### En GitHub Actions (push a repo)

```bash
# 1. Push a GitHub
git add .github/workflows/ci.yml
git commit -m "ci: add complete CI/CD pipeline"
git push origin main

# 2. Verificar en Actions tab
# 3. Verificar imágenes en GHCR
# 4. Verificar SBOM en artifacts
# 5. Verificar firmas: cosign verify ghcr.io/owner/api:latest --certificate-identity-regexp "https://github.com/owner/repo" --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

---

## 3.8 Caso de uso y entregable día 3

### Aplicación al proyecto

```
mi-curso-docker/
├── .github/workflows/
│   ├── ci.yml           # Pipeline completo
│   └── ci-compose.yml   # Compose para tests CI
├── apps/
│   ├── frontend/Dockerfile (hardened)
│   ├── api/Dockerfile (hardened + build secret)
│   └── worker/Dockerfile (hardened)
├── .hadolint.yaml
├── .yamllint.yml
├── .trivyignore
└── Makefile (actualizado)
```

### Entregable obligatorio (push antes del día 4)

- [ ] 3 Dockerfiles hardened: non-root, read-only ready, cap_drop ALL, healthcheck.
- [ ] Build secret configurado en Dockerfile.api (npm_token).
- [ ] `.hadolint.yaml` con reglas del equipo.
- [ ] `.trivyignore` para falsos positivos documentados.
- [ ] `.github/workflows/ci.yml` funcional: lint → build multi-arch → test → scan → sign → deploy staging.
- [ ] Pipeline pasa en GitHub Actions (badge verde en README).
- [ ] Imágenes firmadas verificables con cosign.
- [ ] SBOM generado y subido como artifact.
- [ ] Trivy SARIF subido a GitHub Security tab.
- [ ] Deploy a staging funcional (kind/k3d o cloud).

### Makefile targets día 3

```makefile
# Añadir a Makefile

ci-lint: ## Lint local (hadolint, yamllint, checkov)
	hadolint --failure-threshold=warning apps/*/Dockerfile
	yamllint -c .yamllint.yml docker-compose*.yml
	checkov -d . --framework dockerfile,kubernetes

ci-build: ## Build multi-arch local (sin push)
	docker buildx build --platform $(PLATFORMS) --load -t $(REGISTRY)/$(OWNER)/api:test ./apps/api

ci-scan: ## Scan local con Trivy
	trivy image --severity HIGH,CRITICAL --exit-code 1 $(REGISTRY)/$(OWNER)/api:test

ci-sign: ## Firmar local (requiere cosign + keyless auth)
	cosign sign --yes $(REGISTRY)/$(OWNER)/api:test

ci-sbom: ## Generar SBOM local
	syft $(REGISTRY)/$(OWNER)/api:test -o spdx-json > sbom-api.spdx.json

ci-all: ci-lint ci-build ci-test ci-scan ci-sign ci-sbom ## Pipeline completo local
```

---

## Checkpoint validación

```bash
# validate.sh lab-3
#!/usr/bin/env bash
set -euo pipefail

echo "1. Dockerfiles hardened..."
for svc in frontend api worker; do
  grep -q '^USER ' apps/$svc/Dockerfile || { echo "❌ $svc sin USER"; exit 1; }
  grep -q 'cap_drop.*ALL' apps/$svc/Dockerfile || echo "⚠️ $svc sin cap_drop (se aplica en runtime)"
  grep -q 'HEALTHCHECK' apps/$svc/Dockerfile || { echo "❌ $svc sin HEALTHCHECK"; exit 1; }
done

echo "2. Build secret en api..."
grep -q 'type=secret' apps/api/Dockerfile || { echo "❌ Falta build secret"; exit 1; }

echo "3. Pipeline CI existe..."
[[ -f .github/workflows/ci.yml ]] || { echo "❌ Falta ci.yml"; exit 1; }

echo "4. Hadolint config..."
[[ -f .hadolint.yaml ]] || { echo "❌ Falta .hadolint.yaml"; exit 1; }

echo "5. Trivy ignore..."
[[ -f .trivyignore ]] || { echo "❌ Falta .trivyignore"; exit 1; }

echo "6. Pipeline GitHub Actions pasa..."
# Verificar en GitHub Actions UI o con act
echo "   Verificar manualmente en GitHub Actions"

echo "7. Imágenes firmadas..."
cosign verify ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/api:latest \
  --certificate-identity-regexp "https://github.com/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" || echo "⚠️ Verificar en GHCR"

echo "✅ Checkpoint día 3 superado"
```

---

## Recursos post-sesión

- [Docker security best practices](https://docs.docker.com/engine/security/)
- [BuildKit secrets](https://docs.docker.com/build/building/secrets/)
- [Trivy documentation](https://aquasecurity.github.io/trivy/latest/)
- [Cosign keyless signing](https://docs.sigstore.dev/cosign/keyless/)
- [SLSA framework](https://slsa.dev/)
- [Kyverno policies](https://kyverno.io/policies/)
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)