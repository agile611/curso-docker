# Requisitos y entregables del proyecto final

## Requisitos técnicos obligatorios

### 1. Contenedores e Imágenes (20 puntos)

| Requisito | Detalle | Verificación |
|-----------|---------|--------------|
| **Multi-stage builds** | Builder → Runtime en todos los Dockerfiles | `docker history` muestra 2+ stages |
| **Non-root user** | UID 1001 (o 65532 distroless) | `docker inspect --format '{{.Config.User}}'` |
| **Read-only rootfs ready** | Directorios writables en tmpfs | `docker run --read-only --tmpfs /tmp...` funciona |
| **Capabilities drop** | `cap_drop: [ALL]` en runtime | `docker inspect --format '{{.HostConfig.CapDrop}}'` |
| **Healthcheck** | HTTP/TCP/exec funcional | `docker inspect --format '{{.Config.Healthcheck}}'` |
| **Build secrets** | npm/pip/ssh tokens via BuildKit | `--mount=type=secret` en Dockerfile |
| **Hadolint** | 0 warnings, 0 errors | `hadolint --failure-threshold=warning` |
| **Dive score** | > 90% eficiencia capas | `dive --ci imagen:tag` |
| **Multi-arch** | linux/amd64 + linux/arm64 | `docker manifest inspect` muestra ambas |
| **Tamaño optimizado** | < 200MB (Node), < 100MB (Python), < 20MB (Go) | `docker image inspect --format '{{.Size}}'` |
| **Labels OCI** | title, version, source, description, licenses | `docker inspect --format '{{.Config.Labels}}'` |
| **SBOM** | SPDX + CycloneDX generados | `syft imagen:tag -o spdx-json` |

### 2. Docker Compose (15 puntos)

| Archivo | Propósito | Requisitos clave |
|---------|-----------|------------------|
| `docker-compose.yml` | Base prod-ready | 5 servicios, healthchecks, resources, secrets, networks, volumes |
| `docker-compose.override.yml` | Dev hot reload | target builder, bind mounts, puertos host, CHOKIDAR_USEPOLLING |
| `docker-compose.prod.yml` | Swarm deploy | replicas, update_config, placement, restart_policy |
| `docker-compose.ci.yml` | CI testing | tmpfs volumes, internal network, secrets via env |
| `.env.example` | Documentación | Todas las variables requeridas documentadas |
| `secrets/` | Solo dev | gitignored, archivos ejemplo |

### 3. Helm Chart (20 puntos)

| Componente | Requisito |
|------------|-----------|
| `Chart.yaml` | version, appVersion, dependencies (postgresql, redis bitnami), kubeVersion |
| `values.yaml` | Defaults completos, common settings, security contexts |
| `values-dev.yaml` | Overrides desarrollo |
| `values-staging.yaml` | Overrides staging |
| `values-prod.yaml` | Overrides producción |
| `templates/` | 15+ templates: deployments, services, ingress, HPA, PDB, secrets, configmaps, servicemonitor, networkpolicy, pdb, limitrange, resourcequota |
| `_helpers.tpl` | Funciones: labels, probes, resources, volumes, securityContext |
| `hooks` | pre-install (migrations), post-install (smoke tests) |
| `charts/` | Subcharts postgresql, redis (helm dependency update) |
| `helm template` | Render sin errores |
| `helm install` | En kind exitoso, todos pods Running/Ready |

### 4. Pipeline CI/CD (20 puntos)

| Stage | Requisitos |
|-------|------------|
| **Lint** | hadolint (warning threshold), yamllint, checkov (dockerfile, kubernetes, github_actions) |
| **Build** | buildx multi-arch (amd64/arm64), push GHCR, cache GHA, provenance=true, sbom=true |
| **Test** | Unit en contenedor, Integración (testcontainers), Contract (Pact opcional) |
| **Scan** | Trivy HIGH/CRITICAL = fail, policy Rego custom, ignorefile documentado, SBOM upload |
| **Sign** | cosign keyless, SLSA provenance attestation, cosign verify pasa |
| **Deploy Staging** | kind + Helm, smoke tests, métricas/logs verification |
| **Deploy Production** | Manual approval, values-prod, post-deploy verification |
| **Badges** | CI, Security, Signed, SBOM en README |

### 5. Observabilidad (15 puntos)

| Componente | Requisito |
|------------|-----------|
| **Prometheus** | kube-prometheus-stack, ServiceMonitors para cada servicio, retention 15d |
| **Grafana** | Dashboards: K8s Cluster (315), Node Exporter (1860), Pod Resources (14205), Custom App |
| **Loki** | loki-stack, Promtail DaemonSet, labels namespace/app/component, retention 168h |
| **Tempo** | tempo, storage local, retention 168h, OpenTelemetry Collector (opcional) |
| **Métricas app** | RED: http_requests_total, http_request_duration_seconds, active_connections |
| **Logs** | Structured JSON, labels namespace/app/component, query por trace_id |
| **Traces** | Tempo + OpenTelemetry (si instrumentado), 10% sampling + 100% errors |
| **Alertas** | PrometheusRule: HighErrorRate, HighLatency, PodRestarts, PodNotReady, QueueBacklog |
| **Alertmanager** | Routing a Slack/PagerDuty, inhibition rules, repeat_interval |

### 6. Pruebas (10 puntos)

| Tipo | Herramienta | Cobertura mínima |
|------|-------------|------------------|
| **Unit** | Jest/pytest/go test | > 80% statements, > 70% branches |
| **Integración** | Testcontainers | API↔DB, API↔Redis, Worker↔Queue |
| **Contrato** | Pact (opcional) | Consumer-driven contracts |
| **E2E** | Cypress/Playwright (opcional) | Happy paths críticos |
| **Caos** | Litmus/Chaos Mesh | Pod kill, network partition, latency injection |
| **Performance** | k6/hey | Baseline throughput, latency p95, saturación |

---

## Entregables físicos

### 1. Repositorio Git (obligatorio)
```
taskflow/
├── .github/workflows/ci.yml
├── .github/workflows/cd.yml
├── apps/frontend/Dockerfile
├── apps/api/Dockerfile
├── apps/worker/Dockerfile
├── charts/taskflow/
├── docker-compose.yml
├── docker-compose.override.yml
├── docker-compose.prod.yml
├── docker-compose.ci.yml
├── Makefile
├── README.md
├── .hadolint.yaml
├── .yamllint.yml
├── .trivyignore
├── .sops.yaml
├── secrets.enc.yaml
├── policy/trivy.rego
├── chaos/
└── docs/
```

### 2. Documentación (docs/)

| Archivo | Contenido |
|---------|-----------|
| `adr/001-compose-strategy.md` | Estrategia compose base + overrides |
| `adr/002-hardening-level.md` | Nivel hardening L2 elegido |
| `adr/003-security-pipeline.md` | Gates seguridad pipeline |
| `adr/004-orchestration-platform.md` | Swarm fase 1 → K8s fase 2 |
| `adr/005-observability-stack.md` | LGTM stack elegido |
| `runbooks/deploy-staging.md` | Deploy automático + manual |
| `runbooks/deploy-production.md` | Deploy producción con approval |
| `runbooks/rollback.md` | Helm/kubectl rollback procedures |
| `runbooks/scaling.md` | Manual + HPA + Cluster Autoscaler |
| `runbooks/incident-response.md` | SEV-1/2/3, flujo, plantilla post-mortem |
| `runbooks/rotate-secrets.md` | Rotación DB, JWT, TLS |
| `screenshots/` | 6+ capturas: overview, api-metrics, logs, alerts, prometheus-targets, loki-query |
| `architecture/` | 6 diagramas C4 (Mermaid): context, container, component-api, deployment-swarm, deployment-k8s, observability-flow |

### 3. Presentación (10 min + 5 min demo + 5 min Q&A)

| Sección | Tiempo | Contenido |
|---------|--------|-----------|
| Intro | 1 min | Nombre, rol, objetivo |
| Arquitectura | 2 min | C4 Context + Container diagrams |
| Decisiones clave | 2 min | Top 3 ADRs (hardening, security pipeline, orchestration) |
| Pipeline CI/CD | 1 min | Flujo completo con gates |
| Demo en vivo | 5 min | Deploy staging → smoke test → Grafana → Loki |
| Métricas clave | 1 min | Build time, image size, deploy time, MTTR |
| Lecciones aprendidas | 1 min | Top 3 insights + action items |
| Q&A | 5 min | Preguntas audiencia |

### 4. Demo script (ensayar)

```bash
#!/bin/bash
# demo-script.sh

echo "=== DEMO TASKFLOW: Deploy Staging + Observabilidad ==="

# 1. Trigger deploy
echo "1. Desplegando v1.0.0 a staging..."
helm upgrade --install taskflow ./charts/taskflow \
  -n production -f values-staging.yaml \
  --set global.imageTag=v1.0.0 --wait --timeout 5m

# 2. Verificar pods
echo "2. Pods running..."
kubectl get pods -n production -l app.kubernetes.io/name=taskflow

# 3. Smoke test
echo "3. Smoke test..."
kubectl port-forward -n production svc/taskflow-frontend 8080:8080 &
sleep 3
curl -f http://localhost:8080/healthz
curl -f http://localhost:8080/

# 4. Métricas Grafana
echo "4. Grafana Dashboard: TaskFlow - Overview"
echo "   - http_requests_total (rate 5m)"
echo "   - http_request_duration_seconds p95"
echo "   - active_connections"
echo "   - pod restarts"

# 5. Logs Loki
echo "5. Logs en Loki..."
echo "   Query: {namespace=\"production\", app=\"api\"} |= \"error\""

# 6. Rollback demo
echo "6. Rollback rápido..."
helm rollback taskflow -n production
kubectl rollout status deployment/taskflow-api -n production

echo "=== DEMO COMPLETA ==="
```

---

## Criterios de evaluación detallados

### Rúbrica por área

#### Dockerfiles (20 pts)
| Nivel | Puntos | Descripción |
|-------|--------|-------------|
| **Excelente** | 18-20 | Todos los requisitos, hadolint 0, dive >95%, multi-arch, labels OCI, SBOM |
| **Bueno** | 14-17 | Mayoría requisitos, hadolint < 3 warnings, dive >90%, multi-arch |
| **Suficiente** | 10-13 | Requisitos básicos, hadolint < 5 warnings, dive >80% |
| **Insuficiente** | < 10 | Falta non-root, healthcheck, hadolint errors, no multi-arch |

#### Compose/Helm (15 pts)
| Nivel | Puntos | Descripción |
|-------|--------|-------------|
| **Excelente** | 14-15 | 4 compose files, Helm completo con hooks/subcharts, values por env, helm install OK |
| **Bueno** | 11-13 | 3 compose files, Helm básico, values por env, helm install OK |
| **Suficiente** | 8-10 | 2 compose files, Helm mínimo, helm install OK |
| **Insuficiente** | < 8 | Falta compose prod, Helm incompleto, helm install falla |

#### Pipeline CI/CD (20 pts)
| Nivel | Puntos | Descripción |
|-------|--------|-------------|
| **Excelente** | 18-20 | Todos los stages, Trivy HIGH/CRITICAL=fail, cosign keyless, SLSA, SBOM, deploy staging auto |
| **Bueno** | 14-17 | Mayoría stages, Trivy fail, cosign, deploy staging |
| **Suficiente** | 10-13 | Build+test+scan básicos, cosign, deploy manual |
| **Insuficiente** | < 10 | Pipeline incompleto, sin scan, sin sign, sin deploy |

#### Observabilidad (15 pts)
| Nivel | Puntos | Descripción |
|-------|--------|-------------|
| **Excelente** | 14-15 | LGTM stack completo, dashboards custom, alertas con runbooks, traces |
| **Bueno** | 11-13 | Prometheus+Grafana+Loki, dashboards básicos, alertas básicas |
| **Suficiente** | 8-10 | Prometheus+Grafana, métricas RED, alertas básicas |
| **Insuficiente** | < 8 | Solo métricas básicas, sin alertas, sin logs centralizados |

---

## Fechas límite

| Hito | Fecha | Notas |
|------|-------|-------|
| **Entrega repo** | Día 5, 17:00 | Push a GitHub con tag v1.0.0 |
| **Pipeline verde** | Día 5, 17:30 | CI/CD passing en GitHub Actions |
| **Presentación** | Día 5, 17:15-18:00 | 10 min + demo + Q&A |
| **Ventana de gracia** | +48h | Solo documentación, no código |

---

## Preguntas frecuentes

**P: ¿Puedo usar base images distintas a las del curso?**
R: Sí, mientras cumplan hardening (non-root, read-only ready, healthcheck) y sean oficiales/actualizadas.

**P: ¿Es obligatorio usar Bitnami charts para PostgreSQL/Redis?**
R: No, pero son referencia. Puedes usar tus propios charts o operators (CloudNativePG, Redis Operator).

**P: ¿Qué pasa si mi demo falla en vivo?**
R: Tener grabada la demo (Loom) como backup. Se evalúa el repo, no solo la demo.

**P: ¿Puedo usar GitLab CI en vez de GitHub Actions?**
R: Sí, mientras cubras todos los stages requeridos. Documenta diferencias en ADR.

**P: ¿Cuánto debe durar la presentación?**
R: Exactamente 10 min + 5 min demo + 5 min Q&A. Cronómetro estricto.

**P: ¿Dónde subo las capturas de pantalla?**
R: En `docs/screenshots/` del repo, referenciadas en README y runbooks.

**P: ¿Los diagramas C4 deben ser Mermaid?**
R: Sí, formato `.mmd` en `docs/architecture/` para versionado y renderizado en GitHub.

**P: ¿Qué métricas DORA debo reportar?**
R: Lead time, deploy frequency, MTTR, change failure rate (estimados o reales si tienes histórico).