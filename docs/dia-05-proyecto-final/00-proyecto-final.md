# Día 5 · Proyecto Final Integrador

## Objetivos del día

- [ ] Integrar todo lo aprendido en un proyecto cohesivo listo para producción.
- [ ] Refactorizar y optimizar: Dockerfiles, Compose, Helm, Pipeline, Observabilidad.
- [ ] Ejecutar suite completa de pruebas: unit, integración, contrato, caos.
- [ ] Documentar arquitectura, decisiones, runbooks, diagramas.
- [ ] Preparar y ejecutar presentación final con demo en vivo.
- [ ] Retrospectiva y plan de transferencia al trabajo.

---

## 5.1 Construcción final: refactor y optimización

### Checklist de refactor (aplicar a todos los componentes)

#### Dockerfiles
- [ ] Multi-stage optimizado (builder → runtime)
- [ ] Non-root user (UID 1001) + read-only ready + tmpfs dirs
- [ ] Capabilities: drop ALL
- [ ] Healthcheck funcional (HTTP/TCP/exec)
- [ ] Build secrets para tokens (npm, pip, ssh)
- [ ] `.dockerignore` agresivo (node_modules, .git, dist, tests, docs)
- [ ] Hadolint: 0 warnings
- [ ] Dive score: > 90%
- [ ] Tamaño: < 200MB (Node), < 100MB (Python distroless), < 20MB (Go scratch)
- [ ] Multi-arch: linux/amd64, linux/arm64
- [ ] Labels OCI: title, version, source, description, licenses

#### Docker Compose
- [ ] Base (`docker-compose.yml`): prod-ready, healthchecks, resources, secrets, networks, volumes
- [ ] Override dev (`docker-compose.override.yml`): hot reload, bind mounts, target builder, puertos host
- [ ] Prod (`docker-compose.prod.yml`): replicas, update_config, placement, restart_policy
- [ ] CI (`docker-compose.ci.yml`): tmpfs volumes, internal network, secrets via env
- [ ] `.env.example` documentado
- [ ] Secrets dev en `secrets/` (gitignored)

#### Helm Chart
- [ ] Chart.yaml: version, appVersion, dependencies (postgresql, redis bitnami)
- [ ] values.yaml: defaults completos, common settings, security contexts
- [ ] values-dev.yaml, values-staging.yaml, values-prod.yaml
- [ ] Templates: deployments, services, ingress, HPA, PDB, secrets, configmaps, servicemonitor, networkpolicy, pdb
- [ ] `_helpers.tpl`: labels, probes, resources, volumes, securityContext
- [ ] Hooks: pre-install (migrations), post-install (smoke tests)
- [ ] Subcharts en `charts/` (helm dependency update)
- [ ] `helm template` render sin errores
- [ ] `helm install` en kind exitoso

#### Pipeline CI/CD
- [ ] Lint: hadolint, yamllint, checkov
- [ ] Build: buildx multi-arch, push GHCR, cache GHA, provenance, SBOM
- [ ] Test: unit en contenedor, integración (testcontainers)
- [ ] Scan: Trivy HIGH/CRITICAL = fail, policy Rego, SBOM upload
- [ ] Sign: cosign keyless, SLSA provenance attestation
- [ ] Deploy staging: kind + Helm, smoke tests, métricas/logs verification
- [ ] Deploy production: manual approval, values-prod, post-deploy verification
- [ ] Badges en README: CI, Security, Signed, SBOM

#### Observabilidad
- [ ] Métricas: Prometheus scraping (ServiceMonitor), custom metrics (http_requests_total, http_request_duration_seconds)
- [ ] Logs: Loki + Promtail, structured JSON, labels (namespace, app, component)
- [ ] Traces: Tempo + OpenTelemetry (si instrumentado)
- [ ] Grafana: dashboards importados (K8s cluster, Node Exporter, Pod Resources) + custom app dashboard
- [ ] Alertas: PrometheusRule (HighErrorRate, HighLatency, PodRestarts, PodNotReady)
- [ ] Alertmanager: routing a Slack/PagerDuty, inhibition rules

---

## Sesión práctica 5.1: Pipeline completo end-to-end

### Objetivo
Ejecutar el pipeline completo desde commit hasta staging deploy, validando cada etapa.

### Duración: 90 minutos

### Pasos

```bash
# 1. Commit final con todos los cambios
git add -A
git commit -m "feat: final integration - all components production-ready"
git tag -a v1.0.0 -m "Release v1.0.0 - Curso Docker Fundamentals"
git push origin main --tags

# 2. Verificar pipeline CI en GitHub Actions
# - Lint: hadolint, yamllint, checkov ✅
# - Build: multi-arch push GHCR ✅
# - Test: unit + integration ✅
# - Scan: Trivy 0 HIGH/CRITICAL ✅
# - Sign: cosign keyless ✅
# - SBOM: SPDX + CycloneDX ✅

# 3. Verificar deploy staging (CD)
# - Kind cluster creado ✅
# - Monitoring stack instalado ✅
# - Helm chart deployed ✅
# - Smoke tests passing ✅
# - Métricas en Prometheus ✅
# - Logs en Loki ✅

# 4. Validación manual rápida
kubectl get pods -n production
curl -f https://staging.taskflow.example.com/healthz
curl -f https://api.staging.taskflow.example.com/healthz

# 5. Verificar observabilidad
# - Grafana: dashboard "TaskFlow - Overview" verde
# - Prometheus: targets UP
# - Loki: logs fluyendo
# - Tempo: traces visibles (si instrumentado)

# 6. Test rollback
helm rollback taskflow -n production
kubectl rollout status deployment/taskflow-api -n production

# 7. Test escalado
kubectl scale deployment taskflow-api --replicas=10 -n production
kubectl get hpa taskflow-api -n production
```

### Script de validación completa

```bash
#!/usr/bin/env bash
# validate-final.sh
set -euo pipefail

echo "=== VALIDACIÓN FINAL PROYECTO ==="

# 1. Estructura repo
echo "1. Estructura repo..."
[[ -f .github/workflows/ci.yml ]] || exit 1
[[ -f .github/workflows/cd.yml ]] || exit 1
[[ -d apps/frontend && -d apps/api && -d apps/worker ]] || exit 1
[[ -d charts/taskflow ]] || exit 1
[[ -f docker-compose.yml ]] || exit 1
[[ -f Makefile ]] || exit 1
[[ -f README.md ]] || exit 1
[[ -f .hadolint.yaml ]] || exit 1
[[ -f .trivyignore ]] || exit 1
[[ -f policy/trivy.rego ]] || exit 1
echo "✅ Estructura OK"

# 2. Dockerfiles hardened
echo "2. Dockerfiles hardened..."
for svc in frontend api worker; do
  grep -q '^USER ' apps/$svc/Dockerfile || { echo "❌ $svc sin USER"; exit 1; }
  grep -q 'HEALTHCHECK' apps/$svc/Dockerfile || { echo "❌ $svc sin HEALTHCHECK"; exit 1; }
  hadolint --failure-threshold=warning apps/$svc/Dockerfile || exit 1
done
echo "✅ Dockerfiles OK"

# 3. Helm chart
echo "3. Helm chart..."
[[ -f charts/taskflow/Chart.yaml ]] || exit 1
[[ -f charts/taskflow/values-prod.yaml ]] || exit 1
helm template test charts/taskflow -n production -f values-prod.yaml >/dev/null || exit 1
echo "✅ Helm OK"

# 4. Pipeline CI
echo "4. Pipeline CI..."
echo "   Verificar en GitHub Actions: all green"

# 5. Observabilidad
echo "5. Observabilidad..."
echo "   Verificar: Prometheus, Grafana, Loki, Tempo running"

# 6. Documentación
echo "6. Documentación..."
[[ -f docs/adr/001-compose-strategy.md ]] || exit 1
[[ -f docs/adr/002-hardening-level.md ]] || exit 1
[[ -f docs/adr/003-security-pipeline.md ]] || exit 1
[[ -f docs/adr/004-orchestration-platform.md ]] || exit 1
[[ -f docs/adr/005-observability-stack.md ]] || exit 1
[[ -f docs/runbooks/deploy-staging.md ]] || exit 1
[[ -f docs/runbooks/rollback.md ]] || exit 1
[[ -f docs/runbooks/scaling.md ]] || exit 1
[[ -f docs/runbooks/incident-response.md ]] || exit 1
echo "✅ Documentación OK"

echo "✅ PROYECTO FINAL VALIDADO"
```

---

## 5.2 Pruebas y correcciones: suite completa

### Tipos de pruebas

| Tipo | Herramienta | Cuándo | Qué valida |
|------|-------------|--------|------------|
| **Unit** | Jest, pytest, go test | Cada commit | Lógica de negocio aislada |
| **Integración** | Testcontainers, docker-compose | PR merge, nightly | Interacción entre servicios (API↔DB, API↔Redis) |
| **Contrato** | Pact, Spring Cloud Contract | PR merge | Compatibilidad API consumer/provider |
| **E2E** | Cypress, Playwright | Nightly, release | Flujos usuario completos (UI + API) |
| **Performance** | k6, hey, Locust | Release, monthly | Throughput, latency, saturación |
| **Caos** | Litmus, Chaos Mesh, Pumba | Monthly, pre-prod | Resiliencia: pod kill, network partition, latency |
| **Seguridad** | Trivy, Grype, cosign verify | Cada build | Vulnerabilidades, firmas, SBOM |
| **Config** | Checkov, kube-linter | Cada PR | Misconfig K8s, Dockerfile, IaC |

### Testcontainers ejemplo (API + PostgreSQL + Redis)

```javascript
// apps/api/tests/integration.test.js
const { GenericContainer, StartedTestContainer } = require('testcontainers');
const { Client } = require('pg');
const Redis = require('ioredis');
const request = require('supertest');
const app = require('../src/app');

let pgContainer, redisContainer, apiContainer;
let pgClient, redisClient;

beforeAll(async () => {
  // PostgreSQL
  pgContainer = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_DB: 'app',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres'
    })
    .withExposedPorts(5432)
    .start();

  // Redis
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  // Conectar clientes
  pgClient = new Client({
    host: pgContainer.getHost(),
    port: pgContainer.getMappedPort(5432),
    database: 'app',
    user: 'postgres',
    password: 'postgres'
  });
  await pgClient.connect();

  redisClient = new Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379)
  });

  // Iniciar API (en test, usa contenedores arriba)
  process.env.DATABASE_URL = `postgresql://postgres:postgres@${pgContainer.getHost()}:${pgContainer.getMappedPort(5432)}/app`;
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
});

afterAll(async () => {
  await pgClient.end();
  await redisClient.quit();
  await pgContainer.stop();
  await redisContainer.stop();
});

describe('API Integration', () => {
  test('GET /healthz returns 200', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  test('POST /api/users creates user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .set('Authorization', `Bearer ${generateTestToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test@example.com');
  });

  test('Worker processes async job', async () => {
    // Enviar job via API
    const res = await request(app)
      .post('/api/jobs')
      .send({ type: 'email', payload: { to: 'test@example.com' } })
      .set('Authorization', `Bearer ${generateTestToken()}`);
    expect(res.status).toBe(202);

    // Verificar worker procesó (poll Redis queue)
    await waitForJobCompletion(res.body.jobId);
  });
});
```

### Chaos Engineering (Litmus)

```yaml
# chaos/pod-kill.yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: api-chaos
  namespace: production
spec:
  appinfo:
    appns: production
    applabel: "app=api"
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: '30'
            - name: CHAOS_INTERVAL
              value: '10'
            - name: FORCE
              value: 'false'
```

```bash
# Ejecutar experimento
kubectl apply -f chaos/pod-kill.yaml

# Ver resultados
kubectl get chaosresult -n production
```

---

## 5.3 Documentación y entrega

### Documentos obligatorios

```
docs/
├── adr/
│   ├── 001-compose-strategy.md
│   ├── 002-hardening-level.md
│   ├── 003-security-pipeline.md
│   ├── 004-orchestration-platform.md
│   └── 005-observability-stack.md
├── runbooks/
│   ├── deploy-staging.md
│   ├── deploy-production.md
│   ├── rollback.md
│   ├── scaling.md
│   ├── incident-response.md
│   └── rotate-secrets.md
├── screenshots/
│   ├── grafana-dashboard-overview.png
│   ├── grafana-dashboard-api-metrics.png
│   ├── grafana-dashboard-logs.png
│   ├── grafana-alerts.png
│   ├── prometheus-targets.png
│   └── loki-logs.png
├── architecture/
│   ├── c4-context.png          # Contexto (C4 level 1)
│   ├── c4-container.png        # Contenedores (C4 level 2)
│   ├── c4-component-api.png    # Componentes API (C4 level 3)
│   ├── deployment-swarm.png    # Deploy Swarm
│   ├── deployment-k8s.png      # Deploy K8s
│   └── observability-flow.png  # Flujo métricas/logs/traces
└── README.md                   # Principal (ver abajo)
```

### Diagramas C4 (Mermaid)

```mermaid
# docs/architecture/c4-context.mmd
C4Context
title System Context - Curso Docker App

Person(user, "Usuario", "Usuario final de la aplicación")
Person(admin, "Admin", "Administrador del sistema")

System_Boundary(b1, "Curso Docker App") {
  System(frontend, "Frontend", "React + Nginx, SPA servida estáticamente")
  System(api, "API", "Node.js/Express, REST API, autenticación JWT")
  System(worker, "Worker", "Python/Celery, procesamiento asíncrono")
  SystemDb(db, "PostgreSQL", "Base de datos relacional, datos persistentes")
  SystemCache(redis, "Redis", "Cache, colas de mensajes, sesiones")
}

System_Ext(github, "GitHub", "CI/CD, Registry, Issues")
System_Ext(monitoring, "Observabilidad", "Prometheus, Grafana, Loki, Tempo")

Rel(user, frontend, "HTTPS", "Navega aplicación")
Rel(frontend, api, "HTTPS/REST", "Llamadas API")
Rel(api, db, "SQL", "Persistencia")
Rel(api, redis, "Redis Protocol", "Cache + Colas")
Rel(worker, db, "SQL", "Procesamiento batch")
Rel(worker, redis, "Redis Protocol", "Consumir jobs")
Rel(admin, monitoring, "HTTPS", "Dashboards, alertas")
Rel(github, frontend, "CI/CD", "Build, scan, sign, deploy")
Rel(github, api, "CI/CD", "Build, scan, sign, deploy")
Rel(github, worker, "CI/CD", "Build, scan, sign, deploy")
```

```mermaid
# docs/architecture/c4-container.mmd
C4Container
title Container Diagram - Curso Docker App

Container(frontend, "Frontend", "React + Nginx", "Puerto 8080, healthcheck /healthz")
Container(api, "API", "Node.js/Express", "Puerto 3000, healthcheck /healthz, JWT auth")
Container(worker, "Worker", "Python/Celery", "Consume Redis queues, procesa async")
ContainerDb(db, "PostgreSQL", "PostgreSQL 16", "Puerto 5432, datos persistentes, PVC")
ContainerCache(redis, "Redis", "Redis 7", "Puerto 6379, cache + queues")

Container_Ext(github, "GitHub Actions", "CI/CD Pipeline")
Container_Ext(registry, "GHCR", "Container Registry")
Container_Ext(prom, "Prometheus", "Métricas + Alertas")
Container_Ext(grafana, "Grafana", "Dashboards")
Container_Ext(loki, "Loki", "Logs agregados")
Container_Ext(tempo, "Tempo", "Traces distribuidos")

Rel(frontend, api, "HTTPS/REST", "API calls")
Rel(api, db, "SQL", "Prisma ORM")
Rel(api, redis, "Redis", "Cache + BullMQ queues")
Rel(worker, db, "SQL", "Batch jobs")
Rel(worker, redis, "Redis", "Consume jobs")
Rel(github, registry, "Push", "Multi-arch images")
Rel(registry, frontend, "Pull", "Deploy")
Rel(registry, api, "Pull", "Deploy")
Rel(registry, worker, "Pull", "Deploy")
Rel(api, prom, "Metrics", "/metrics endpoint")
Rel(frontend, loki, "Logs", "Structured JSON")
Rel(api, loki, "Logs", "Structured JSON")
Rel(worker, loki, "Logs", "Structured JSON")
Rel(api, tempo, "Traces", "OpenTelemetry")
```

---

## 5.4 Presentaciones y revisión

### Estructura presentación (10 min + 5 min demo + 5 min Q&A)

| Sección | Tiempo | Contenido |
|---------|--------|-----------|
| **1. Intro** | 1 min | Nombre, rol, objetivo del proyecto |
| **2. Arquitectura** | 2 min | Diagrama C4 contexto + contenedores |
| **3. Decisiones clave** | 2 min | 3 ADRs más importantes (hardening, security pipeline, orchestration) |
| **4. Pipeline CI/CD** | 1 min | Flujo: lint → build → test → scan → sign → deploy |
| **5. Demo en vivo** | 5 min | Deploy staging → smoke test → métricas Grafana → logs Loki |
| **6. Métricas clave** | 1 min | Build time, image size, deploy time, MTTR |
| **7. Lecciones aprendidas** | 1 min | Top 3 insights + action items |
| **8. Q&A** | 5 min | Preguntas audiencia |

### Script demo en vivo

```bash
#!/bin/bash
# demo-script.sh (ensayar antes)

echo "=== DEMO: Deploy Staging + Observabilidad ==="

# 1. Trigger deploy (GitHub Actions o manual)
echo "1. Desplegando versión v1.2.3 a staging..."
helm upgrade --install curso-app ./charts/curso-app \
  -n production -f values-staging.yaml \
  --set global.imageTag=v1.2.3 --wait --timeout 5m

# 2. Verificar pods
echo "2. Verificando pods..."
kubectl get pods -n production -l app.kubernetes.io/name=curso-app

# 3. Smoke test
echo "3. Smoke test..."
kubectl port-forward -n production svc/curso-app-frontend 8080:8080 &
sleep 3
curl -f http://localhost:8080/healthz
curl -f http://localhost:8080/

# 4. Métricas en Grafana
echo "4. Abriendo Grafana..."
echo "   Dashboard: Curso App - API Metrics"
echo "   Métricas: http_requests_total, http_request_duration_seconds (p95)"

# 5. Logs en Loki
echo "5. Logs en Loki..."
echo "   Query: {namespace=\"production\", app=\"api\"} |= \"error\""

# 6. Rollback demo
echo "6. Rollback rápido..."
helm rollback curso-app -n production
kubectl rollout status deployment/curso-app-api -n production

echo "=== DEMO COMPLETA ==="
```

---

## 5.5 Transferencia al trabajo

### Plan de adopción (30-60-90 días)

#### Primeros 30 días: Fundación
- [ ] Configurar registry privado (Harbor/GHCR/ECR) + cosign keyless
- [ ] Implementar pipeline CI base (lint + build + test) en 1 repo piloto
- [ ] Hardening Dockerfiles: non-root, read-only, healthcheck en 3 servicios
- [ ] Documentar ADR 001-002 en wiki equipo
- [ ] Compartir runbooks: deploy, rollback, incident response

#### 60 días: Seguridad y Observabilidad
- [ ] Pipeline completo: scan (Trivy), sign (cosign), SBOM (Syft)
- [ ] Deploy staging automático en K8s (kind → EKS/GKE)
- [ ] Observabilidad: Prometheus + Grafana + Loki (mínimo)
- [ ] Alertas críticas: error rate, latency, pod restarts
- [ ] Capacitar equipo: workshop 2h "Docker/K8s security basics"

#### 90 días: Producción y Cultura
- [ ] GitOps: ArgoCD/Flux para deploy production
- [ ] Service Mesh: Istio/Cilium (mTLS, traffic splitting)
- [ ] Chaos Engineering: Litmus mensual, game days trimestrales
- [ ] Cost optimization: VPA, cluster autoscaler, spot instances
- [ ] Documentación viva: ADRs, runbooks, architecture diagrams actualizados
- [ ] Métricas DORA: lead time, deploy frequency, MTTR, change failure rate

### Métricas DORA objetivo

| Métrica | Actual (estimado) | Objetivo 90 días | Élite |
|---------|-------------------|------------------|-------|
| **Lead Time** | Semanas | < 1 día | < 1 hora |
| **Deploy Frequency** | Mensual | Diario | Bajo demanda |
| **MTTR** | Horas | < 30 min | < 10 min |
| **Change Failure Rate** | 20-30% | < 10% | < 5% |

### Checklist transferencia personal

- [ ] Repo GitHub con todo el código (público o interno)
- [ ] README con badges, quickstart, arquitectura
- [ ] ADRs documentados en wiki/Confluence
- [ ] Runbooks en Notion/GitBook/Confluence
- [ ] Dashboards Grafana exportados (JSON)
- [ ] Alertas PrometheusRule en repo
- [ ] Presentación grabada (Loom/Teams) para onboarding
- [ ] Lista de "quick wins" para el equipo
- [ ] Contacto para dudas (Slack/email)

---

## Entregable final: Repositorio completo

```
mi-curso-docker/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # Pipeline completo
│   │   ├── cd.yml              # Deploy staging/prod
│   │   └── dependabot.yml      # Updates automáticos
│   └── kind-config.yaml        # Kind cluster config
├── apps/
│   ├── frontend/
│   │   ├── Dockerfile          # Hardened L2, multi-stage
│   │   ├── nginx.conf
│   │   ├── .dockerignore
│   │   └── src/
│   ├── api/
│   │   ├── Dockerfile          # Hardened L2 + build secret
│   │   ├── .dockerignore
│   │   └── src/
│   └── worker/
│       ├── Dockerfile          # Hardened L2 (distroless)
│       ├── .dockerignore
│       └── src/
├── charts/
│   └── curso-app/              # Helm chart completo
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-staging.yaml
│       ├── values-prod.yaml
│       ├── .helmignore
│       ├── README.md
│       ├── templates/          # 15+ templates
│       ├── charts/             # Subcharts (postgresql, redis)
│       └── tests/
├── docker-compose.yml          # Base prod-ready
├── docker-compose.override.yml # Dev hot reload
├── docker-compose.prod.yml     # Swarm prod
├── docker-compose.ci.yml       # CI tmpfs
├── .env.example
├── secrets/                    # Solo dev (gitignored)
├── .hadolint.yaml
├── .yamllint.yml
├── .trivyignore
├── .sops.yaml
├── secrets.enc.yaml            # SOPS encrypted
├── policy/
│   ├── trivy.rego
│   └── custom.rego
├── chaos/                      # Litmus experiments
├── Makefile                    # Targets unificados
├── README.md                   # Con badges, arquitectura
├── LICENSE
└── docs/
    ├── adr/                    # 5 ADRs
    ├── runbooks/               # 6 runbooks
    ├── screenshots/            # 6+ capturas
    └── architecture/           # 6 diagramas C4 (Mermaid)
```

---

## Checklist final día 5

| ✅ | Entregable | Verificación |
|----|------------|--------------|
| 1 | 3 Dockerfiles hardened L2 | non-root, read-only, cap_drop, healthcheck, build secret |
| 2 | 4 Compose files | base, override, prod, ci |
| 3 | Helm chart completo | Chart.yaml, 4 values, 15+ templates, hooks, subcharts |
| 4 | Pipeline CI/CD | lint→build→test→scan→sign→deploy staging→deploy prod |
| 5 | Observabilidad | Prometheus, Grafana, Loki, Tempo + dashboards + alertas |
| 6 | Pruebas | unit, integración (testcontainers), caos (litmus) |
| 7 | Documentación | 5 ADRs, 6 runbooks, 6 diagramas C4, 6 screenshots |
| 8 | README | Badges, quickstart, arquitectura, links |
| 9 | Repo Git | Commits atómicos, conventional commits, tags semver |
| 10 | Presentación | 10 min + 5 min demo + 5 min Q&A |
| 11 | Retrospectiva | Start/Stop/Continue, action items |
| 12 | Plan transferencia | 30-60-90 días, métricas DORA |

---

## Retrospectiva final (formato Start/Stop/Continue)

### Start (qué empezar)
- [ ] GitOps con ArgoCD para production
- [ ] Service Mesh (Cilium) para mTLS
- [ ] Chaos Engineering mensual
- [ ] Cost monitoring (Kubecost/OpenCost)
- [ ] Dependency scanning (Dependabot + Renovate)

### Stop (qué dejar)
- [ ] Deploy manual `kubectl apply` / `docker stack deploy`
- [ ] Secrets en `.env` files commiteados
- [ ] Imágenes `latest` en producción
- [ ] Debugging con `kubectl exec` en prod (usar observabilidad)
- [ ] Documentación en Word/Drive (solo Markdown en repo)

### Continue (qué mantener)
- [ ] Pipeline CI/CD como source of truth
- [ ] ADRs para decisiones arquitectónicas
- [ ] Runbooks versionados con código
- [ ] Multi-arch builds (amd64/arm64)
- [ ] Security scanning en cada PR
- [ ] Structured logging JSON
- [ ] Healthchecks en todos los servicios
- [ ] Code review obligatorio (PR template)

---

## Recursos post-curso

### Certificación y siguientes pasos
- [Docker Certified Associate (DCA)](https://training.mirantis.com/dca-certification/)
- [CKA (Certified Kubernetes Administrator)](https://training.linuxfoundation.org/certification/cka/)
- [CKAD (Certified Kubernetes Application Developer)](https://training.linuxfoundation.org/certification/ckad/)
- [CKS (Certified Kubernetes Security Specialist)](https://training.linuxfoundation.org/certification/cks/)

### Comunidades
- [CNCF Slack](https://slack.cncf.io/) (#kubernetes, #helm, #prometheus, #loki, #tempo)
- [Docker Community Slack](https://dockr.ly/comm-slack)
- [GitOps Working Group](https://github.com/gitops-working-group)

### Lecturas recomendadas
- *Kubernetes Up & Running* (Kelsey Hightower)
- *Site Reliability Engineering* (Google)
- *Building Secure & Reliable Systems* (Google)
- *Cloud Native DevOps with Kubernetes* (O'Reilly)
- *Observability Engineering* (O'Reilly)

### Newsletters
- [Kubernetes Weekly](https://kubernetesweekly.io/)
- [CNCF Newsletter](https://www.cncf.io/newsletter/)
- [DevOps Weekly](https://www.devopsweekly.com/)
- [SRE Weekly](https://sreweekly.com/)

---

## ¡Felicidades! 🎉

Has completado el **Curso Docker Fundamentals: 5 días, 30 horas**.

### Lo que has construido:
- ✅ **Imágenes Docker** profesionales, seguras, multi-arch
- ✅ **Docker Compose** para dev, CI, prod, Swarm
- ✅ **Pipeline CI/CD** completo con seguridad integrada
- ✅ **Helm Chart** production-ready con observabilidad
- ✅ **Orquestación** en Swarm y Kubernetes
- ✅ **Observabilidad** unificada: métricas, logs, traces
- ✅ **Documentación** viva: ADRs, runbooks, diagramas C4
- ✅ **Prácticas DevOps** modernas: GitOps-ready, security-first

### Próximos pasos sugeridos:
1. **Aplica** en tu proyecto real esta semana
2. **Comparte** con tu equipo (workshop interno)
3. **Profundiza** en un área: Security, K8s, Observabilidad, GitOps
4. **Certifica** si tu rol lo requiere
5. **Contribuye** a open source (Helm charts, operators, tooling)

---

**¡Gracias por tu dedicación! Nos vemos en producción.** 🚀

*Curso Docker Fundamentals - Agile611 - 2024*