# Día 3 - 03: Roles, tono y formatos (Escaneo y CI/CD)

## Objetivos de la sesión

- [ ] Configurar escaneo de vulnerabilidades: Docker Scout, Trivy, Syft/Grype.
- [ ] Generar y validar SBOM (SPDX, CycloneDX).
- [ ] Implementar policy gates: fallar build si HIGH/CRITICAL.
- [ ] Construir pipeline CI/CD completo con GitHub Actions.
- [ ] Integrar firma de imágenes (cosign) y attestations (SLSA).

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap secrets + preguntas escaneo/CI |
| 30 min | Teoría: escáneres, SBOM, policy gates, pipeline patterns |
| 20 min | Demo: Trivy, Syft, cosign, GitHub Actions |
| 10 min | Break |
| 50 min | Laboratorio guiado: pipeline completo end-to-end |
| 20 min | Laboratorio autónomo: policy personalizada, dashboards |
| 10 min | Preguntas + checkpoint |

---

## Escáneres de vulnerabilidades: comparativa

| Herramienta | Tipo | Fortalezas | Integración |
|-------------|------|------------|-------------|
| **Docker Scout** | Integrado en Docker | Dashboard web, policy engine, base image recommendations | Docker CLI, GitHub Actions, CI/CD |
| **Trivy** | Standalone (Aqua) | Comprehensive (OS, lang, config, secrets), SBOM, misconfig | CLI, GitHub Actions, GitLab CI, Jenkins, SARIF |
| **Syft** | SBOM generator (Anchore) | Fast, multiple formats (SPDX, CycloneDX, JSON) | CLI, GitHub Actions, Syft library |
| **Grype** | Vuln scanner (Anchore) | Uses Syft SBOM, fast, multiple sources | CLI, GitHub Actions, Grype library |
| **Docker Scan** | Legacy (Snyk) | Deprecated → usar Scout/Trivy | - |

### Matriz de cobertura

| Fuente | Docker Scout | Trivy | Grype |
|--------|--------------|-------|-------|
| **OS packages** (apt, apk, rpm) | ✅ | ✅ | ✅ |
| **Language packages** (npm, pip, cargo, go, maven) | ✅ | ✅ | ✅ |
| **Config misconfig** (Dockerfile, K8s, TF) | ✅ | ✅ | ❌ |
| **Secrets detection** | ✅ | ✅ | ❌ |
| **SBOM generation** | ✅ | ✅ | ✅ (via Syft) |
| **Policy engine** | ✅ (built-in) | ✅ (OPA/Rego) | ❌ |
| **Dashboard** | ✅ (web) | ❌ | ❌ |

---

## Docker Scout: uso práctico

```bash
# Habilitar
docker scout enable

# Escanear imagen local
docker scout cves mi-imagen:tag

# Escanear con detalle
docker scout cves mi-imagen:tag --format sarif > scout.sarif

# Policy evaluation
docker scout policy mi-imagen:tag

# Recomendaciones de base image
docker scout recommendations mi-imagen:tag

# Comparar imágenes
docker scout compare mi-imagen:old mi-imagen:new

# Dashboard web
docker scout dashboard
```

### Policy personalizada (Docker Scout)

```yaml
# .docker/scout/policy.yaml
version: 1
policies:
  - id: no-critical-high
    name: "No CRITICAL or HIGH vulnerabilities"
    description: "Fail if any CRITICAL or HIGH severity vulnerabilities found"
    severity: HIGH
    action: fail
  - id: no-fixed-in-base
    name: "No vulnerabilities fixed in newer base image"
    description: "Warn if base image has fixes available"
    action: warn
```

```bash
# Evaluar con policy
docker scout policy mi-imagen:tag --policy-file .docker/scout/policy.yaml
```

---

## Trivy: uso completo

```bash
# Instalar
brew install trivy

# Escanear imagen (OS + language packages)
trivy image --severity HIGH,CRITICAL mi-imagen:tag

# Escanear filesystem (código, config, Dockerfile)
trivy fs --severity HIGH,CRITICAL ./apps/api

# Escanear config (IaC: Dockerfile, K8s, Terraform, CloudFormation)
trivy config --severity HIGH,CRITICAL ./docker-compose.yml

# Escanear registry (sin pull)
trivy image --registry-token $TOKEN ghcr.io/owner/imagen:tag

# Output SARIF para GitHub Security
trivy image --format sarif --output trivy.sarif mi-imagen:tag

# Output JSON para parsing
trivy image --format json --output trivy.json mi-imagen:tag

# Ignorar vulnerabilidades (falsos positivos)
trivy image --ignorefile .trivyignore mi-imagen:tag
```

### `.trivyignore` ejemplo

```yaml
# .trivyignore
# Formato: CVE-ID:reason
CVE-2023-1234: "False positive - not exploitable in our context"
CVE-2023-5678: "Will fix in next base image update (scheduled 2024-02)"

# O por package
python3.12: "Acceptable risk - no exploit vector"
```

### Trivy en GitHub Actions

```yaml
# .github/workflows/trivy.yml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }}
    format: 'sarif'
    output: 'trivy-${{ matrix.service }}.sarif'
    severity: 'HIGH,CRITICAL'
    exit-code: '1'
    ignore-unfixed: true

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: 'trivy-${{ matrix.service }}.sarif'
    category: ${{ matrix.service }}
```

---

## Syft + Grype: SBOM + Scan

### Syft: generar SBOM

```bash
# Instalar
brew install syft

# Generar SBOM (múltiples formatos)
syft mi-imagen:tag -o spdx-json > sbom.spdx.json
syft mi-imagen:tag -o cyclonedx-json > sbom.cdx.json
syft mi-imagen:tag -o table
syft mi-imagen:tag -o json > sbom.json

# Desde filesystem (sin imagen)
syft dir:./apps/api -o spdx-json > sbom-api.spdx.json

# Desde tarball
syft docker-archive:imagen.tar -o spdx-json > sbom.spdx.json
```

### Grype: escanear usando SBOM

```bash
# Instalar
brew install grype

# Escanear imagen directamente
grype mi-imagen:tag

# Escanear SBOM generado por Syft (más rápido, reproducible)
grype sbom:sbom.spdx.json

# Output table/JSON/SARIF
grype mi-imagen:tag -o table
grype mi-imagen:tag -o json > grype.json
grype mi-imagen:tag -o sarif > grype.sarif
```

### Pipeline SBOM + Scan

```bash
# 1. Generar SBOM en build
syft ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ needs.build.outputs.version }} -o spdx-json > sbom-${{ matrix.service }}.spdx.json

# 2. Subir SBOM como artifact
actions/upload-artifact@v4:
  name: sbom-${{ matrix.service }}
  path: sbom-${{ matrix.service }}.*

# 3. Escanear SBOM (rápido, no requiere pull)
grype sbom:sbom-${{ matrix.service }}.spdx.json --fail-on HIGH --fail-on CRITICAL
```

---

## Policy Gates: fallar build automáticamente

### Trivy policy (Rego)

```rego
# policy/trivy.rego
package trivy

# Denegar si hay CRITICAL
deny[msg] {
  input.Results[_].Vulnerabilities[_].Severity == "CRITICAL"
  msg := sprintf("CRITICAL vulnerability: %s (%s)", [input.Results[_].Vulnerabilities[_].VulnerabilityID, input.Results[_].Vulnerabilities[_].PkgName])
}

# Denegar si hay HIGH (opcional)
deny[msg] {
  input.Results[_].Vulnerabilities[_].Severity == "HIGH"
  input.Results[_].Vulnerabilities[_].FixedVersion != ""
  msg := sprintf("HIGH vulnerability with fix available: %s (%s) - fixed in %s", [input.Results[_].Vulnerabilities[_].VulnerabilityID, input.Results[_].Vulnerabilities[_].PkgName, input.Results[_].Vulnerabilities[_].FixedVersion])
}

# Warn si HIGH sin fix
warn[msg] {
  input.Results[_].Vulnerabilities[_].Severity == "HIGH"
  input.Results[_].Vulnerabilities[_].FixedVersion == ""
  msg := sprintf("HIGH vulnerability NO FIX: %s (%s)", [input.Results[_].Vulnerabilities[_].VulnerabilityID, input.Results[_].Vulnerabilities[_].PkgName])
}
```

```bash
# Evaluar policy
trivy image --policy policy/trivy.rego mi-imagen:tag
```

### Docker Scout policy (YAML)

```yaml
# .docker/scout/policy.yaml
version: 1
policies:
  - id: block-critical
    name: "Block CRITICAL vulnerabilities"
    severity: CRITICAL
    action: fail
  - id: block-high-with-fix
    name: "Block HIGH with fix available"
    severity: HIGH
    action: fail
    conditions:
      - fixed_version_exists: true
  - id: warn-high-no-fix
    name: "Warn HIGH no fix"
    severity: HIGH
    action: warn
    conditions:
      - fixed_version_exists: false
```

---

## Pipeline CI/CD completo: arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GITHUB ACTIONS PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌──────────────┐    ┌──────┐    ┌─────────┐    ┌────────┐  │
│  │  LINT   │───►│   BUILD      │───►│ TEST │───►│  SCAN   │───►│ SIGN   │  │
│  │         │    │  (multi-arch)│    │      │    │         │    │        │  │
│  │ hadolint│    │ buildx       │    │unit  │    │ Trivy   │    │ cosign │  │
│  │ yamllint│    │ push GHCR    │    │integ │    │ Syft    │    │ keyless│  │
│  │ checkov │    │ cache GHA    │    │      │    │ SBOM    │    │ SLSA   │  │
│  └─────────┘    └──────────────┘    └──────┘    └─────────┘    └────────┘  │
│       │               │                │           │            │          │
│       ▼               ▼                ▼           ▼            ▼          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ARTIFACTS                                        │   │
│  │  • Imágenes multi-arch en GHCR (tag: semver, sha, latest)          │   │
│  │  • SBOM (SPDX + CycloneDX)                                         │   │
│  │  • Provenance (SLSA)                                               │   │
│  │  • Firmas cosign (keyless)                                         │   │
│  │  • SARIF reports (GitHub Security tab)                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    DEPLOY STAGING                                   │   │
│  │  • kind/k3d cluster                                                │   │
│  │  • Helm deploy                                                     │   │
│  │  • Smoke tests                                                     │   │
│  │  • Integration tests                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### `.github/workflows/ci.yml` (versión completa - ver día 3 índice)

Puntos clave ya cubiertos en el índice día 3. Aquí patrones adicionales:

#### Matrix strategy para paralelismo

```yaml
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
```

#### Cache optimizado (GitHub Actions cache)

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
  with:
    driver-opts: network=host

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
    # O cache en registry
    # cache-from: type=registry,ref=ghcr.io/owner/cache:buildkit
    # cache-to: type=registry,ref=ghcr.io/owner/cache:buildkit,mode=max
```

#### Conditional deploy

```yaml
deploy-staging:
  if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
  environment: staging
  steps:
    - uses: actions/checkout@v4
    - name: Deploy to staging
      run: |
        kubectl set image deployment/api api=${{ env.REGISTRY }}/${{ env.OWNER }}/api:${{ needs.build.outputs.version }} -n staging
        kubectl rollout status deployment/api -n staging --timeout=300s
```

---

## Laboratorio guiado: Pipeline end-to-end

### 1. Configurar Trivy + Syft local

```bash
# Instalar
brew install trivy syft grype cosign

# Test local en imagen del día 1
trivy image --severity HIGH,CRITICAL ghcr.io/usuario/api:latest
syft ghcr.io/usuario/api:latest -o spdx-json > sbom-api.spdx.json
grype sbom:sbom-api.spdx.json --fail-on HIGH --fail-on CRITICAL
```

### 2. Firmar imagen local

```bash
# Autenticar cosign (keyless - abre browser)
cosign sign --yes ghcr.io/usuario/api:latest

# Verificar
cosign verify ghcr.io/usuario/api:latest \
  --certificate-identity-regexp "https://github.com/usuario/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

### 3. Ejecutar pipeline con `act` (local)

```bash
# Instalar act
brew install act

# Ejecutar job build (requiere secrets)
act -j build \
  -s GITHUB_TOKEN=$(gh auth token) \
  -s SOPS_AGE_KEY=$(cat age.key) \
  --secret NPM_TOKEN=fake-token

# O solo lint + test
act -j lint,test
```

### 4. Push a GitHub y verificar

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add complete pipeline with scan, sign, deploy"
git push origin main

# Ver en GitHub Actions:
# 1. Jobs: lint → build → test → scan → sign → deploy-staging
# 2. Artifacts: SBOMs
# 3. Security tab: SARIF findings
# 4. Packages: imágenes firmadas (badge "Signed")
# 5. Staging deploy: logs de kubectl rollout
```

---

## Laboratorio autónomo: Policy personalizada + Dashboards

### Tarea 1: Policy custom para el equipo

```rego
# policy/team.rego
package team

# Reglas específicas del equipo
deny[msg] {
  # No imágenes base antiguas (> 6 meses)
  input.Results[_].Target =~ ".*:(alpine|debian|ubuntu)@sha256:.*"
  # Verificar fecha de la imagen base via metadata
  # (requiere parsing de manifest)
}

deny[msg] {
  # No packages con licencia GPL en runtime
  input.Results[_].Licenses[_] =~ "GPL.*"
  msg := sprintf("GPL license not allowed in runtime: %s", [input.Results[_].PkgName])
}

warn[msg] {
  # Warn si imagen > 500MB
  input.BlobSize > 500000000
  msg := sprintf("Image size %d bytes exceeds 500MB", [input.BlobSize])
}
```

### Tarea 2: Dashboard de vulnerabilidades

```bash
# Trivy dashboard (experimental)
trivy server --port 8080

# O usar Harbor/Quay con scanner integrado
# O DefectDojo para gestión de vulnerabilidades
```

### Tarea 3: Métricas de pipeline

```yaml
# Añadir a workflow para métricas
- name: Collect metrics
  run: |
    echo "build_duration_seconds=$(date +%s -d "${{ steps.build.start_time }}")" >> $GITHUB_OUTPUT
    echo "image_size_mb=$(docker manifest inspect ${{ env.REGISTRY }}/${{ env.OWNER }}/${{ matrix.service }}:${{ steps.meta.outputs.version }} | jq '.manifests[0].size / 1024 / 1024')" >> $GITHUB_OUTPUT

- name: Publish metrics
  uses: actions/github-script@v7
  with:
    script: |
      // Enviar a Datadog/Prometheus/Grafana
```

---

## Checkpoint validación

```bash
# validate.sh lab-3-3
#!/usr/bin/env bash
set -euo pipefail

echo "1. Trivy scan pasa (HIGH/CRITICAL)..."
trivy image --severity HIGH,CRITICAL --exit-code 1 ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/api:latest || exit 1

echo "2. SBOM generado..."
[[ -f sbom-api.spdx.json ]] || exit 1
jq -e '.packages | length > 0' sbom-api.spdx.json || exit 1

echo "3. Grype scan en SBOM..."
grype sbom:sbom-api.spdx.json --fail-on HIGH --fail-on CRITICAL || exit 1

echo "4. Imagen firmada..."
cosign verify ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/api:latest \
  --certificate-identity-regexp "https://github.com/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" || exit 1

echo "5. Pipeline CI existe y pasa..."
# Verificar en GitHub Actions UI
echo "   Verificar manualmente: GitHub Actions → ci.yml → all green"

echo "✅ Checkpoint 3.3 superado"
```

---

## Recursos post-sesión

- [Docker Scout](https://docs.docker.com/scout/)
- [Trivy](https://aquasecurity.github.io/trivy/latest/)
- [Syft](https://github.com/anchore/syft)
- [Grype](https://github.com/anchore/grype)
- [Cosign](https://docs.sigstore.dev/cosign/)
- [SLSA](https://slsa.dev/)
- [GitHub Actions security](https://docs.github.com/en/actions/security-guides)
- [OPA/Rego](https://www.openpolicyagent.org/docs/latest/policy-language/)