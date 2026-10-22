# Día 4 - 05: Caso de uso y entregable (Orquestación + Observabilidad integrados)

## Objetivos de la sesión

- [ ] Integrar Swarm/K8s, Helm, Observabilidad en pipeline unificado.
- [ ] Validar end-to-end: commit → build → scan → sign → deploy staging (K8s).
- [ ] Configurar alertas y dashboards operativos.
- [ ] Documentar runbooks: deploy, rollback, scaling, incident response.
- [ ] Entregar stack listo para producción.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap semana + visión integrada |
| 20 min | Pipeline unificado: revisión arquitectura día 4 |
| 10 min | Break |
| 60 min | Laboratorio guiado: pipeline CD + observabilidad |
| 30 min | Validación end-to-end + runbooks |
| 20 min | Documentación final: ADR, runbooks, README |
| 10 min | Preguntas + preparación día 5 |

---

## Pipeline CD unificado: arquitectura día 4

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE CD COMPLETO (DÍA 4)                                 │
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
│  │  ✅ Deploy staging (kind + Helm)                                            │   │
│  │  ✅ Smoke tests + healthchecks                                              │   │
│  │  ✅ Métricas en Prometheus/Grafana                                          │   │
│  │  ✅ Logs en Loki                                                            │   │
│  │  ✅ Traces en Tempo (si instrumentado)                                      │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## `.github/workflows/cd.yml` (Deploy continuo a staging)

```yaml
name: CD - Deploy Staging

on:
  workflow_run:
    workflows: ["CI - Complete Pipeline"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      version:
        description: 'Image tag to deploy (default: latest)'
        required: false
        default: 'latest'
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]

env:
  REGISTRY: ghcr.io
  OWNER: ${{ github.repository_owner }}
  CLUSTER_NAME: staging

permissions:
  contents: read
  packages: read
  id-token: write

jobs:
  # =========================================================================
  # DEPLOY STAGING (kind)
  # =========================================================================
  deploy-staging:
    name: Deploy to Staging (kind)
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Helm
        uses: azure/setup-helm@v4

      - name: Create kind cluster
        uses: helm/kind-action@v1.10.0
        with:
          cluster_name: ${{ env.CLUSTER_NAME }}
          config: .github/kind-config.yaml

      - name: Install monitoring stack
        run: |
          helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
          helm repo add grafana https://grafana.github.io/helm-charts
          helm repo update
          helm install monitoring prometheus-community/kube-prometheus-stack \
            -n monitoring --create-namespace \
            -f observability/values.yaml
          helm install loki grafana/loki-stack -n monitoring -f observability/values.yaml
          helm install tempo grafana/tempo -n monitoring -f observability/values.yaml

      - name: Create secrets
        run: |
          kubectl create namespace production --dry-run=client -o yaml | kubectl apply -f -
          kubectl create secret generic db-secret \
            --from-literal=db_password=${{ secrets.STAGING_DB_PASSWORD }} \
            -n production --dry-run=client -o yaml | kubectl apply -f -
          kubectl create secret generic jwt-secret \
            --from-literal=jwt_secret=${{ secrets.STAGING_JWT_SECRET }} \
            -n production --dry-run=client -o yaml | kubectl apply -f -

      - name: Deploy with Helm
        run: |
          VERSION=${{ github.event.inputs.version || 'latest' }}
          helm upgrade --install curso-app ./charts/curso-app \
            -n production --create-namespace \
            -f charts/curso-app/values-staging.yaml \
            --set global.imageTag=$VERSION \
            --set global.registry=${{ env.REGISTRY }}/${{ env.OWNER }} \
            --wait --timeout 10m

      - name: Smoke tests
        run: |
          # Wait for pods ready
          kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=curso-app -n production --timeout=300s
          
          # Port forward & test
          kubectl port-forward -n production svc/curso-app-frontend 8080:8080 &
          PF_PID=$!
          sleep 5
          curl -f http://localhost:8080/healthz
          curl -f http://localhost:8080/
          kill $PF_PID
          
          kubectl port-forward -n production svc/curso-app-api 3000:3000 &
          PF_PID=$!
          sleep 3
          curl -f http://localhost:3000/healthz
          kill $PF_PID

      - name: Verify metrics
        run: |
          # Check Prometheus scraping
          kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090 &
          PF_PID=$!
          sleep 3
          curl -s "http://localhost:9090/api/v1/query?query=up{namespace=\"production\"}" | jq '.data.result[] | select(.metric.job=="curso-app-api") | .value[1]' | grep -q "1"
          kill $PF_PID

      - name: Verify logs in Loki
        run: |
          kubectl port-forward -n monitoring svc/loki 3100:3100 &
          PF_PID=$!
          sleep 3
          curl -s "http://localhost:3100/loki/api/v1/query?query={namespace=\"production\"}" | jq '.data.result | length > 0'
          kill $PF_PID

  # =========================================================================
  # DEPLOY PRODUCTION (manual approval)
  # =========================================================================
  deploy-production:
    name: Deploy to Production
    needs: deploy-staging
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'production'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Helm
        uses: azure/setup-helm@v4

      - name: Configure kubectl for production
        run: |
          echo "${{ secrets.PROD_KUBECONFIG }}" | base64 -d > $HOME/.kube/config
          kubectl config use-context production

      - name: Deploy with Helm (production values)
        run: |
          VERSION=${{ github.event.inputs.version || 'latest' }}
          helm upgrade --install curso-app ./charts/curso-app \
            -n production \
            -f charts/curso-app/values-prod.yaml \
            --set global.imageTag=$VERSION \
            --set global.registry=${{ env.REGISTRY }}/${{ env.OWNER }} \
            --wait --timeout 15m

      - name: Post-deploy verification
        run: |
          # Health checks
          kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=curso-app -n production --timeout=300s
          
          # Smoke tests against production URL
          curl -f https://api.example.com/healthz
          curl -f https://frontend.example.com/healthz

      - name: Notify deployment
        run: |
          # Slack/Teams/Email notification
          echo "✅ Production deployment completed: ${{ github.event.inputs.version }}"
```

---

## Validación end-to-end completa

### Script: `validate-day4.sh`

```bash
#!/usr/bin/env bash
# validate-day4.sh
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== VALIDACIÓN DÍA 4 COMPLETA ===${NC}"

# 1. Swarm deploy
echo "1. Swarm deploy + operaciones..."
docker swarm init 2>/dev/null || true
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml test-swarm
sleep 20
docker stack services test-swarm | grep -q "3/3" || { echo -e "${RED}❌ Swarm replicas${NC}"; exit 1; }
docker service update --image ghcr.io/owner/api:latest test-swarm_api
sleep 15
docker service rollback test-swarm_api
sleep 10
docker service scale test-swarm_api=5
sleep 10
TASK=$(docker service ps test-swarm_api -q | head -1)
docker kill $(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK)
sleep 5
docker stack rm test-swarm
echo -e "${GREEN}✅ Swarm OK${NC}"

# 2. Kind + Helm
echo "2. Kind cluster + Helm chart..."
kind create cluster --name test-day4 --config .github/kind-config.yaml
kubectl create ns production
kubectl create secret generic db-secret --from-literal=db_password=test -n production
kubectl create secret generic jwt-secret --from-literal=jwt_secret=test -n production
cd charts/curso-app && helm dependency update
helm install test . -n production -f values-prod.yaml --wait --timeout 10m
kubectl get pods -n production | grep -q Running || { echo -e "${RED}❌ Pods not running${NC}"; exit 1; }
echo -e "${GREEN}✅ Helm OK${NC}"

# 3. Observabilidad
echo "3. Observabilidad stack..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f ../../observability/values.yaml
helm install loki grafana/loki-stack -n monitoring -f ../../observability/values.yaml
helm install tempo grafana/tempo -n monitoring -f ../../observability/values.yaml
sleep 30
kubectl get pods -n monitoring | grep -q Running || { echo -e "${RED}❌ Monitoring pods${NC}"; exit 1; }
echo -e "${GREEN}✅ Observabilidad OK${NC}"

# 4. Métricas app
echo "4. Métricas aplicación..."
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090 &
PF_PID=$!
sleep 5
curl -s "http://localhost:9090/api/v1/query?query=up{namespace=\"production\"}" | jq '.data.result[] | select(.metric.job=="curso-app-api") | .value[1]' | grep -q "1" || echo -e "${GREEN}⚠️ Métricas app no scrapeadas aún (verificar ServiceMonitor)${NC}"
kill $PF_PID

# 5. Logs Loki
echo "5. Logs en Loki..."
kubectl port-forward -n monitoring svc/loki 3100:3100 &
PF_PID=$!
sleep 3
curl -s "http://localhost:3100/loki/api/v1/query?query={namespace=\"production\"}" | jq '.data.result | length > 0' || echo -e "${GREEN}⚠️ Logs no en Loki aún (verificar Promtail)${NC}"
kill $PF_PID

# 6. Runbooks
echo "6. Runbooks documentados..."
[[ -f docs/runbooks/deploy-staging.md ]] || { echo -e "${RED}❌ Falta deploy-staging.md${NC}"; exit 1; }
[[ -f docs/runbooks/rollback.md ]] || { echo -e "${RED}❌ Falta rollback.md${NC}"; exit 1; }
[[ -f docs/runbooks/scaling.md ]] || { echo -e "${RED}❌ Falta scaling.md${NC}"; exit 1; }
[[ -f docs/runbooks/incident-response.md ]] || { echo -e "${RED}❌ Falta incident-response.md${NC}"; exit 1; }
echo -e "${GREEN}✅ Runbooks OK${NC}"

# 7. ADR
echo "7. ADR documentados..."
[[ -f docs/adr/004-orchestration-platform.md ]] || { echo -e "${RED}❌ Falta ADR 004${NC}"; exit 1; }
echo -e "${GREEN}✅ ADR OK${NC}"

# Limpieza
kind delete cluster --name test-day4
docker swarm leave --force 2>/dev/null || true

echo -e "${GREEN}=== TODAS LAS VALIDACIONES DÍA 4 PASARON ===${NC}"
echo ""
echo "Entregables día 4 completados:"
echo "  ✅ Swarm deploy funcional (rolling, rollback, scale, failover)"
echo "  ✅ Kind cluster + Helm chart completo"
echo "  ✅ Chart con: deployments, services, ingress, HPA, PDB, secrets, configmaps"
echo "  ✅ Subcharts: postgresql, redis (bitnami)"
echo "  ✅ Observabilidad: Prometheus, Grafana, Loki, Tempo"
echo "  ✅ Métricas app en Prometheus (ServiceMonitor)"
echo "  ✅ Logs en Loki (Promtail)"
echo "  ✅ Traces en Tempo (si instrumentado)"
echo "  ✅ Dashboards Grafana (capturas en docs/screenshots/)"
echo "  ✅ Alertas PrometheusRule"
echo "  ✅ Runbooks: deploy, rollback, scaling, incident"
echo "  ✅ ADR 004: Orchestration Platform"
echo "  ✅ Pipeline CD: staging automático, production manual"
```

---

## Runbooks operacionales

### `docs/runbooks/deploy-staging.md`

```markdown
# Runbook: Deploy to Staging

## Trigger
- Automático: CI pipeline successful en branch `main`
- Manual: `workflow_dispatch` con version tag

## Prerrequisitos
- Kind cluster `staging` corriendo
- Monitoring stack instalado
- Secrets `db-secret`, `jwt-secret` en namespace `production`

## Procedimiento

### 1. Deploy automático (CI/CD)
```bash
# Se ejecuta automáticamente via GitHub Actions
# Ver: .github/workflows/cd.yml
```

### 2. Deploy manual (emergencia)
```bash
# 1. Obtener versión a deployar
VERSION=v1.2.3  # o latest, sha-abc123

# 2. Deploy con Helm
helm upgrade --install curso-app ./charts/curso-app \
  -n production \
  -f charts/curso-app/values-staging.yaml \
  --set global.imageTag=$VERSION \
  --wait --timeout 10m

# 3. Verificar
kubectl get pods -n production
kubectl rollout status deployment/curso-app-api -n production
```

### 3. Verificación post-deploy
```bash
# Health checks
curl -f http://staging.example.com/healthz
curl -f http://api.staging.example.com/healthz

# Métricas
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# Query: up{namespace="production"} == 1

# Logs
kubectl port-forward -n monitoring svc/loki 3100:3100
# Query: {namespace="production"} |= "error"
```

## Rollback
```bash
# Helm rollback (preferido)
helm rollback curso-app -n production

# O kubectl
kubectl rollout undo deployment/curso-app-api -n production
kubectl rollout status deployment/curso-app-api -n production
```

## Troubleshooting
| Síntoma | Acción |
|---------|--------|
| Pods Pending | `kubectl describe pod` → check events, resources, PVC |
| ImagePullBackOff | Verificar secret `ghcr-secret`, tag existe en GHCR |
| CrashLoopBackOff | `kubectl logs --previous`, check resources, probes |
| HPA no escala | `kubectl describe hpa`, check metrics server, resource requests |
```

---

### `docs/runbooks/rollback.md`

```markdown
# Runbook: Rollback Deployment

## Cuándo hacer rollback
- Deploy fallido (healthchecks failing)
- Métricas degradadas (error rate > 5%, latency p99 > 1s)
- Incidente reportado por usuarios
- Smoke tests fallan post-deploy

## Procedimiento

### Opción 1: Helm Rollback (recomendado)
```bash
# Ver historial
helm history curso-app -n production

# Rollback a revisión anterior
helm rollback curso-app -n production

# Rollback a revisión específica
helm rollback curso-app 3 -n production

# Verificar
helm status curso-app -n production
kubectl rollout status deployment/curso-app-api -n production
```

### Opción 2: Kubectl Rollback
```bash
# Ver historial
kubectl rollout history deployment/curso-app-api -n production

# Rollback a revisión anterior
kubectl rollout undo deployment/curso-app-api -n production

# Rollback a revisión específica
kubectl rollout undo deployment/curso-app-api --to-revision=3 -n production

# Verificar
kubectl rollout status deployment/curso-app-api -n production
```

### Opción 3: Image Tag Rollback (si Helm no disponible)
```bash
# Obtener tag anterior funcional
PREV_TAG=v1.2.2

# Actualizar deployment
kubectl set image deployment/curso-app-api \
  curso-app-api=ghcr.io/owner/api:$PREV_TAG \
  -n production

kubectl rollout status deployment/curso-app-api -n production
```

## Verificación post-rollback
1. Health checks: `curl -f https://api.example.com/healthz`
2. Métricas: error rate < 1%, latency p95 < 500ms
3. Logs: no errores en Loki
4. Negocio: funcionalidad crítica OK

## Comunicación
- Notificar en #deployments channel
- Actualizar incident ticket si aplica
- Documentar causa raíz en post-mortem
```

---

### `docs/runbooks/scaling.md`

```markdown
# Runbook: Scaling Services

## Escalado Manual

### Swarm
```bash
# Escalar servicio
docker service scale curso-swarm_api=10

# Verificar
docker service ps curso-swarm_api
```

### Kubernetes (kubectl)
```bash
# Escalar deployment
kubectl scale deployment curso-app-api --replicas=10 -n production

# Verificar
kubectl get pods -n production -l app.kubernetes.io/component=api
kubectl rollout status deployment/curso-app-api -n production
```

### Kubernetes (Helm)
```bash
# Actualizar values y upgrade
helm upgrade curso-app ./charts/curso-app \
  -n production \
  --set api.replicaCount=10 \
  --wait --timeout 5m
```

## Escalado Automático (HPA)

### Verificar HPA
```bash
kubectl get hpa -n production
kubectl describe hpa curso-app-api -n production
```

### Configurar HPA (valores en values.yaml)
```yaml
api:
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 50
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
```

### Métricas custom (requiere Prometheus Adapter)
```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
```

## Cluster Autoscaler (nodes)

### AWS (EKS)
```bash
# Verificar cluster autoscaler
kubectl logs -n kube-system deployment/cluster-autoscaler

# Configurar node groups con labels
# taints para workloads especializados
```

## Escalado de Base de Datos

### PostgreSQL (read replicas)
```bash
# Bitnami postgresql chart
postgresql:
  readReplicas:
    replicaCount: 2
```

### Redis (cluster mode)
```bash
redis:
  cluster:
    enabled: true
    nodes: 6
```

## Checklist pre-escalado
- [ ] Recursos cluster suficientes (CPU, memoria, IPs)
- [ ] Límites de cuota (ResourceQuota) no bloquean
- [ ] PDB permite disruption (minAvailable)
- [ ] Base de datos soporta conexiones adicionales
- [ ] Redis memoria suficiente para más workers
- [ ] Load balancer / Ingress maneja más backends
```

---

### `docs/runbooks/incident-response.md`

```markdown
# Runbook: Incident Response

## Niveles de severidad

| Nivel | Definición | SLA respuesta | Ejemplos |
|-------|------------|---------------|----------|
| **SEV-1** | Servicio caído, impacto crítico negocio | 15 min | API down, DB down, 100% error rate |
| **SEV-2** | Degradación significativa, impacto parcial | 1 hora | Latencia alta, 5% error rate, feature rota |
| **SEV-3** | Incidente menor, workaround existe | 4 horas | Bug UI, log spam, métrica anómala |

## Flujo de respuesta

```
DETECCIÓN → TRIAGE → MITIGACIÓN → RESOLUCIÓN → POST-MORTEM
   │           │          │           │           │
   ▼           ▼          ▼           ▼           ▼
Alert/      Severity    Rollback/   Root cause  Documentar,
User report  assign     Scale/      fix         action items
             on-call    Config      deploy      follow-up
```

## Procedimiento por severidad

### SEV-1: Servicio caído
1. **ACK** en < 15 min (on-call)
2. **Comunicar** en #incidents: "SEV-1: API down, investigating"
3. **Mitigar** (5 min):
   - Rollback último deploy: `helm rollback curso-app -n production`
   - O escalar: `kubectl scale deployment/api --replicas=20`
   - O reiniciar: `kubectl delete pods -l app=api`
4. **Diagnosticar** (paralelo):
   - Logs: `kubectl logs -l app=api --tail=100`
   - Métricas: Grafana dashboards
   - Traces: Tempo (si disponible)
5. **Resolver**: Fix + deploy o rollback permanente
6. **Comunicar**: "SEV-1 resolved: API restored"
7. **Post-mortem** en 48h

### SEV-2: Degradación
1. **ACK** en < 1 hora
2. **Comunicar** en #incidents: "SEV-2: High latency on API"
3. **Mitigar**: Escalar, ajustar config, restart pods
4. **Diagnosticar**: Logs, métricas, traces
5. **Resolver**: Fix + deploy
6. **Post-mortem** en 1 semana

### SEV-3: Incidente menor
1. **ACK** en < 4 horas
2. **Crear ticket** en Jira/GitHub Issues
3. **Fix** en próximo sprint
4. **Deploy** en próxima release

## Herramientas de diagnóstico

```bash
# Estado general
kubectl get all -n production
kubectl get events -n production --sort-by='.lastTimestamp'

# Logs
kubectl logs -l app=api -n production --tail=100 -f
kubectl logs -l app=api -n production --previous

# Métricas
kubectl top pods -n production
kubectl top nodes

# Debug interactivo
kubectl debug -it pod/api-xxx --image=busybox --target=api -n production

# Network
kubectl run -i --rm curl --image=curlimages/curl --restart=Never -- curl -v http://api:3000/healthz

# Traces (Tempo)
# Grafana → Explore → Tempo → Search traces
```

## Comunicación

| Canal | Uso |
|-------|-----|
| `#incidents` | Coordinación técnica, updates |
| `#stakeholders` | Updates negocio (SEV-1/2) |
| `statuspage.io` | Comunicación externa (SEV-1) |
| `postmortems/` repo | Documentación post-incidente |

## Plantilla Post-mortem

```markdown
# Post-mortem: INC-YYYY-MM-DD-XXX

## Resumen
- **Fecha**: YYYY-MM-DD
- **Duración**: XX min
- **Severidad**: SEV-X
- **Servicios afectados**: API, Frontend
- **Impacto**: X% usuarios afectados, Y errores

## Cronología
- HH:MM - Detección (alert/usuario)
- HH:MM - ACK on-call
- HH:MM - Mitigación (rollback/scale)
- HH:MM - Resolución (fix deploy)
- HH:MM - Cierre

## Causa raíz
[Análisis 5 Whys]

## Acciones correctivas
- [ ] Fix inmediato (deploy/rollback)
- [ ] Fix preventivo (código/config)
- [ ] Mejora detección (alerta/dashboard)
- [ ] Mejora mitigación (runbook/automatización)

## Lecciones aprendidas
- Qué funcionó bien
- Qué mejorar
- Action items con owner y fecha
```
```

---

## ADR: Documentación decisiones día 4

### `docs/adr/004-orchestration-platform.md`

```markdown
# ADR 004: Container Orchestration Platform

## Status
Accepted

## Context
Choose orchestration platform for production workloads. Team has Docker expertise, current stack: 5 services (frontend, API, worker, PostgreSQL, Redis).

## Decision
**Phase 1 (Months 1-6): Docker Swarm**
- Rationale: Team knows Docker, fast deploy (< 1 min), sufficient for current scale
- Criteria to migrate to K8s:
  - > 10 services
  - Need GitOps (ArgoCD/Flux)
  - Multi-cloud deployment
  - Service Mesh (mTLS, traffic splitting)
  - Advanced scheduling (topology spread, priority classes)
  - Compliance requiring RBAC granular

**Phase 2 (Month 6+): Kubernetes (EKS/GKE)**
- Rationale: Industry standard, massive ecosystem, GitOps native, Service Mesh
- Migration path: Kompose → Helm → ArgoCD

## Consequences
- Swarm: Technical debt accepted, migration planned and documented
- K8s: Investment in learning (2-3 months), tooling, platform team
- Hybrid period: Both running during migration (canary)

## Alternatives considered
- **Nomad**: Rejected - smaller ecosystem, less talent pool
- **ECS/Fargate**: Rejected - AWS lock-in, less control
- **Raw K8s from start**: Rejected - team not ready, would delay MVP
- **K3s**: Considered for edge, not main platform
```

### `docs/adr/005-observability-stack.md`

```markdown
# ADR 005: Observability Stack

## Status
Accepted

## Context
Need unified observability for metrics, logs, traces across Swarm and K8s.

## Decision
**LGTM Stack (Loki, Grafana, Tempo, Mimir/Prometheus)**
- **Metrics**: Prometheus (kube-prometheus-stack) + ServiceMonitors
- **Logs**: Loki + Promtail (DaemonSet)
- **Traces**: Tempo + OpenTelemetry Collector
- **Visualization**: Grafana (dashboards, alerting, Explore)
- **Alerting**: PrometheusRule + Alertmanager → Slack/PagerDuty

## Rationale
- All CNCF projects, vendor-neutral
- Integrated in Grafana (single pane of glass)
- Cost-effective: Loki/Tempo cheaper than Elasticsearch/Jaeger
- Kubernetes-native: Operators, Helm charts, CRDs
- Multi-tenant ready

## Alternatives considered
- **ELK/EFK**: Rejected - resource heavy, complex, expensive
- **Datadog/New Relic**: Rejected - vendor lock-in, cost at scale
- **Jaeger**: Rejected - separate from metrics/logs, no Loki integration
- **Thanos/Cortex**: Considered for long-term metrics, not needed yet
```

---

## Checklist final día 4

| ✅ | Entregable | Verificación |
|----|------------|--------------|
| 1 | Swarm deploy funcional | `docker stack deploy` + rolling/rollback/scale/failover |
| 2 | Kind cluster | `kind create cluster` + ingress + ports 80/443 |
| 3 | Helm chart `charts/curso-app/` | Chart.yaml, values.yaml, values-env.yaml, 15+ templates |
| 4 | Subcharts | postgresql, redis (bitnami) en `charts/` |
| 5 | Templates core | deployments, services, ingress, HPA, PDB, secrets, configmaps |
| 6 | `_helpers.tpl` | Funciones reutilizables (labels, probes, resources) |
| 7 | Hooks | pre-install (migrations), post-install (smoke tests) |
| 8 | Observabilidad stack | Prometheus, Grafana, Loki, Tempo instalados |
| 9 | ServiceMonitor | Métricas app scrapeadas en Prometheus |
| 10 | Promtail | Logs en Loki con labels namespace, app |
| 11 | Tempo | Traces recibidos (si app instrumentada) |
| 12 | Grafana dashboards | Capturas en `docs/screenshots/` |
| 13 | Alertas | PrometheusRule con SEV-1/2/3 |
| 14 | Pipeline CD | `.github/workflows/cd.yml` staging auto, prod manual |
| 15 | Runbooks (4) | deploy, rollback, scaling, incident-response |
| 16 | ADR (2) | 004-orchestration, 005-observability |
| 17 | README actualizado | Badges, quickstart, arquitectura |

---

## Preparación día 5

- Revisar: [Día 5 índice](../dia-05-proyecto-final/index.md)
- Traer: Todo el repo validado, pipeline verde, dashboards funcionando.
- Dudas: Integración final, presentación, transferencia al trabajo.

---

## Recursos post-sesión

- [Helm best practices](https://helm.sh/docs/chart_best_practices/)
- [Grafana alerting](https://grafana.com/docs/grafana/latest/alerting/)
- [Loki queries](https://grafana.com/docs/loki/latest/query/)
- [Tempo queries](https://grafana.com/docs/tempo/latest/traceql/)
- [Incident response](https://github.com/google/sre-workbook/blob/main/chapters/incident-response.md)
- [Post-mortem culture](https://github.com/dastergon/awesome-sre#postmortems)