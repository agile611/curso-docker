# Día 3 - 04: Laboratorio comparativo (Seguridad end-to-end)

## Objetivos de la sesión

- [ ] Comparar estrategias de hardening: baseline vs non-root vs read-only vs gVisor.
- [ ] Evaluar escáneres: Docker Scout vs Trivy vs Grype en imágenes reales.
- [ ] Medir overhead de seguridad: build time, image size, runtime performance.
- [ ] Implementar policy gates y medir false positives/negatives.
- [ ] Documentar decisiones de seguridad (ADR).

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap + presentación matriz comparativa |
| 20 min | Setup: 4 variantes de hardening + 3 escáneres |
| 10 min | Break |
| 60 min | Ejecución comparativa + métricas |
| 20 min | Análisis resultados + discusión trade-offs |
| 10 min | Preguntas + checkpoint |

---

## Matriz comparativa: 4 niveles de hardening

| Nivel | Descripción | Dockerfile changes | Runtime flags |
|-------|-------------|-------------------|---------------|
| **L0: Baseline** | Imagen estándar, root, read-write | Ninguno | Ninguno |
| **L1: Non-root** | Usuario no-root (UID 1001) | `USER 1001` | Ninguno |
| **L2: Hardened** | Non-root + read-only + cap_drop + tmpfs | `USER`, dirs writables | `--read-only --cap-drop=ALL --tmpfs /tmp...` |
| **L3: gVisor** | Hardened + runtime gVisor | Igual L2 | `--runtime=runsc` |

### Dockerfiles para cada nivel

```dockerfile
# L0: Baseline (apps/api/Dockerfile.baseline)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/server.js"]
```

```dockerfile
# L1: Non-root (apps/api/Dockerfile.nonroot)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
USER appuser
CMD ["node", "dist/server.js"]
```

```dockerfile
# L2: Hardened (apps/api/Dockerfile.hardened)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Preparar dirs writables
USER root
RUN mkdir -p /tmp/app /var/run/app /var/cache/app && \
    chown -R appuser:appgroup /tmp/app /var/run/app /var/cache/app
USER appuser

COPY --chown=appuser:appgroup --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist
COPY --chown=appuser:appgroup --from=builder /app/package.json ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

```dockerfile
# L3: gVisor usa mismo Dockerfile que L2, solo cambia runtime
```

---

## Métricas a medir

| Métrica | Herramienta | Objetivo |
|---------|-------------|----------|
| **Build time** | `time docker build` | < 2min (warm cache) |
| **Image size** | `docker image inspect --format '{{.Size}}'` | < 200MB (Node) |
| **Layer count** | `docker history --format '{{.ID}}' | wc -l` | < 20 |
| **Dive score** | `dive --ci` | > 90% |
| **Trivy HIGH/CRITICAL** | `trivy image --severity HIGH,CRITICAL` | 0 |
| **Startup time** | `time docker run --rm imagen curl /healthz` | < 5s |
| **Memory baseline** | `docker stats --no-stream` | < 100MB idle |
| **CPU baseline** | `docker stats --no-stream` | < 1% idle |
| **Request latency** | `hey -n 1000 -c 10` | p99 < 100ms |

---

## Ejecución comparativa

### 1. Build de las 4 variantes

```bash
cd apps/api

# L0: Baseline
time docker build -t api:l0-baseline -f Dockerfile.baseline .

# L1: Non-root
time docker build -t api:l1-nonroot -f Dockerfile.nonroot .

# L2: Hardened (multi-stage)
time docker build -t api:l2-hardened -f Dockerfile.hardened .

# L3: gVisor (usa L2)
docker tag api:l2-hardened api:l3-gvisor
```

### 2. Análisis estático

```bash
# Tamaño
for tag in l0-baseline l1-nonroot l2-hardened l3-gvisor; do
  SIZE=$(docker image inspect api:$tag --format '{{.Size}}' | numfmt --to=iec)
  LAYERS=$(docker history api:$tag --format '{{.ID}}' | wc -l)
  echo "api:$tag → Size: $SIZE, Layers: $LAYERS"
done

# Dive efficiency
for tag in l0-baseline l1-nonroot l2-hardened; do
  echo "=== api:$tag ==="
  dive --ci api:$tag 2>&1 | tail -5
done

# Trivy scan
for tag in l0-baseline l1-nonroot l2-hardened; do
  echo "=== api:$tag ==="
  trivy image --severity HIGH,CRITICAL --exit-code 0 api:$tag 2>&1 | grep -E "(HIGH|CRITICAL|Total)"
done
```

### 3. Análisis runtime

```bash
# Función para testear variante
test_variant() {
  local tag=$1
  local runtime_flags=$2
  
  echo "=== Testing $tag ==="
  
  # Startup time
  START=$(date +%s%N)
  CID=$(docker run -d $runtime_flags api:$tag)
  sleep 3
  END=$(date +%s%N)
  STARTUP_MS=$(( (END - START) / 1000000 ))
  echo "Startup: ${STARTUP_MS}ms"
  
  # Healthcheck
  for i in {1..10}; do
    if docker exec $CID curl -sf http://localhost:3000/healthz >/dev/null; then
      echo "Healthcheck: OK"
      break
    fi
    sleep 1
  done
  
  # Resource usage
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $CID
  
  # Load test (hey)
  PORT=$(docker port $CID 3000 | cut -d: -f2)
  hey -n 1000 -c 10 http://localhost:$PORT/ 2>&1 | grep -E "(Requests/sec|Latency|p99)"
  
  # Cleanup
  docker rm -f $CID >/dev/null
}

# Test cada variante
test_variant l0-baseline ""
test_variant l1-nonroot ""
test_variant l2-hardened "--read-only --cap-drop=ALL --tmpfs /tmp:rw,noexec,nosuid,size=50m --tmpfs /var/run:rw,size=10m"
test_variant l3-gvisor "--runtime=runsc --read-only --cap-drop=ALL --tmpfs /tmp:rw,noexec,nosuid,size=50m --tmpfs /var/run:rw,size=10m"
```

---

## Resultados esperados (referencia)

| Métrica | L0 Baseline | L1 Non-root | L2 Hardened | L3 gVisor |
|---------|-------------|-------------|-------------|-----------|
| **Build time** | 45s | 45s | 50s | 50s |
| **Image size** | 180 MB | 180 MB | 180 MB | 180 MB |
| **Layers** | 12 | 13 | 15 | 15 |
| **Dive score** | 85% | 85% | 92% | 92% |
| **Trivy CRITICAL** | 0 | 0 | 0 | 0 |
| **Trivy HIGH** | 2-3 | 2-3 | 2-3 | 2-3 |
| **Startup time** | 800ms | 850ms | 900ms | 1500ms |
| **Memory idle** | 45 MB | 45 MB | 45 MB | 65 MB |
| **CPU idle** | 0.1% | 0.1% | 0.1% | 0.5% |
| **Req/sec (hey)** | 12,000 | 11,800 | 11,500 | 9,500 |
| **p99 latency** | 12ms | 13ms | 14ms | 25ms |
| **Root access** | ✅ Sí | ❌ No | ❌ No | ❌ No |
| **FS write /** | ✅ Sí | ✅ Sí | ❌ No | ❌ No |
| **Capabilities** | ALL | ALL | NONE | NONE |
| **Kernel isolation** | Compartido | Compartido | Compartido | gVisor (userspace) |

---

## Análisis de trade-offs

### Seguridad vs Performance

```
Seguridad
    ▲
    │     L3 gVisor  ●
    │                │
    │     L2 Hardened ●
    │                │
    │     L1 Non-root ●
    │                │
    │     L0 Baseline ●
    │
    └────────────────────────► Performance
         L0    L1    L2    L3
```

### Decisiones recomendadas por contexto

| Contexto | Nivel recomendado | Razón |
|----------|-------------------|-------|
| **Desarrollo local** | L1 Non-root | Balance velocidad/seguridad |
| **CI/CD pipeline** | L2 Hardened | Seguridad sin overhead runtime |
| **Producción multi-tenant** | L3 gVisor | Aislamiento fuerte requerido |
| **Producción single-tenant** | L2 Hardened | Suficiente, mejor performance |
| **Workloads untrusted** | L3 gVisor / Kata | Código de terceros, CTF, etc. |
| **Compliance (PCI, SOC2)** | L2+Hardened | Auditable, documentado |

---

## Comparativa escáneres: Trivy vs Grype vs Scout

### Setup

```bash
# Imagen de test (con vulnerabilidades conocidas)
docker pull vulnerable-image:latest  # O usar api:l0-baseline

# Escanear con los 3
echo "=== Trivy ==="
time trivy image --severity HIGH,CRITICAL api:l0-baseline

echo "=== Grype ==="
syft api:l0-baseline -o spdx-json > sbom.spdx.json
time grype sbom:sbom.spdx.json --fail-on HIGH --fail-on CRITICAL

echo "=== Docker Scout ==="
time docker scout cves api:l0-baseline --only-severity high,critical
```

### Resultados típicos

| Aspecto | Trivy | Grype | Docker Scout |
|---------|-------|-------|--------------|
| **Velocidad** | ~15s | ~8s (con SBOM) | ~20s |
| **Cobertura OS** | Excelente | Excelente | Buena |
| **Cobertura lang** | Excelente | Excelente | Buena |
| **Config scan** | ✅ | ❌ | ✅ |
| **Secrets scan** | ✅ | ❌ | ✅ |
| **SBOM** | ✅ | ✅ (via Syft) | ✅ |
| **Policy engine** | Rego | ❌ | YAML |
| **Dashboard** | No | No | Sí (web) |
| **False positives** | Bajos | Bajos | Medios |
| **Integración CI** | Excelente | Buena | Buena |

### Recomendación

- **CI/CD principal**: Trivy (más completo, SARIF, policy Rego)
- **SBOM generation**: Syft (estándar, rápido)
- **Fast scan en PR**: Grype sobre SBOM (muy rápido)
- **Dashboard/equipo**: Docker Scout (visual, policy UI)

---

## Laboratorio autónomo: Policy gates tuning

### Tarea 1: Ajustar policy para false positives

```bash
# 1. Identificar false positive
trivy image --format json api:l2-hardened | jq '.Results[].Vulnerabilities[] | select(.VulnerabilityID=="CVE-2023-XXXX")'

# 2. Añadir a .trivyignore
echo "CVE-2023-XXXX: False positive - not in our code path" >> .trivyignore

# 3. Verificar
trivy image --ignorefile .trivyignore --severity HIGH,CRITICAL --exit-code 1 api:l2-hardened
```

### Tarea 2: Policy Rego custom

```rego
# policy/custom.rego
package custom

# Solo fallar si HIGH tiene fix disponible Y es en runtime (no dev deps)
deny[msg] {
  vuln := input.Results[_].Vulnerabilities[_]
  vuln.Severity == "HIGH"
  vuln.FixedVersion != ""
  not vuln.PkgName =~ ".*-dev$"
  not vuln.PkgName =~ ".*-test$"
  msg := sprintf("HIGH with fix: %s (%s) fixed in %s", [vuln.VulnerabilityID, vuln.PkgName, vuln.FixedVersion])
}

# Warn si CRITICAL sin fix (requiere revisión manual)
warn[msg] {
  vuln := input.Results[_].Vulnerabilities[_]
  vuln.Severity == "CRITICAL"
  vuln.FixedVersion == ""
  msg := sprintf("CRITICAL NO FIX - MANUAL REVIEW: %s (%s)", [vuln.VulnerabilityID, vuln.PkgName])
}
```

```bash
# Test policy
trivy image --policy policy/custom.rego api:l2-hardened
```

---

## ADR Template: Decisiones de seguridad

```markdown
# ADR 003: Container Hardening Level

## Status
Accepted

## Context
Need to choose default hardening level for all production containers.

## Decision
Use **Level 2 (Hardened)** as default for all production workloads:
- Non-root user (UID 1001)
- Read-only rootfs with tmpfs for writable dirs
- Capabilities: drop ALL
- Seccomp: default profile
- Healthchecks mandatory

Exceptions:
- Workloads requiring kernel modules → document exception, use L1 + specific caps
- Legacy apps needing root → isolate in dedicated namespace, plan migration

## Consequences
- + Security posture improved significantly
- + Compliance (CIS, PCI) easier
- - Build complexity slightly increased (tmpfs dirs)
- - Debugging harder (read-only, no shell in distroless)
- - Startup time +50ms (negligible)

## Alternatives considered
- L3 gVisor: rejected for default due to 20% performance overhead
- L1 only: rejected, insufficient for production
```

---

## Checkpoint validación

```bash
# validate.sh lab-3-4
#!/usr/bin/env bash
set -euo pipefail

echo "1. 4 variantes construidas..."
for tag in l0-baseline l1-nonroot l2-hardened l3-gvisor; do
  docker image inspect api:$tag >/dev/null || exit 1
done

echo "2. Métricas capturadas..."
# Verificar que script de métricas generó output
[[ -f /tmp/security-metrics.csv ]] || echo "⚠️ Métricas no guardadas (manual)"

echo "3. Trivy scan en todas..."
for tag in l0-baseline l1-nonroot l2-hardened; do
  trivy image --severity CRITICAL --exit-code 1 api:$tag || exit 1
done

echo "4. Hardened pasa read-only test..."
docker run --rm --read-only --cap-drop=ALL --tmpfs /tmp:rw,noexec,nosuid,size=10m api:l2-hardened touch /tmp/ok
! docker run --rm --read-only api:l2-hardened touch /fail 2>/dev/null || exit 1

echo "5. gVisor runtime funciona..."
docker run --rm --runtime=runsc api:l3-gvisor uname -a | grep -q gVisor

echo "✅ Checkpoint 3.4 superado"
```

---

## Recursos post-sesión

- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [NIST Container Security Guide](https://csrc.nist.gov/publications/detail/sp/800-190/final)
- [gVisor performance](https://gvisor.dev/docs/architecture_guide/performance/)
- [Trivy vs Grype comparison](https://aquasecurity.github.io/trivy/latest/docs/comparison/)
- [Docker Scout policies](https://docs.docker.com/scout/policies/)