# Día 4 - 04: Laboratorio comparativo (Swarm vs Kubernetes)

## Objetivos de la sesión

- [ ] Comparar operativamente: Swarm vs Kubernetes para el mismo stack.
- [ ] Medir: tiempo deploy, rolling update, rollback, escalado, failover.
- [ ] Evaluar: complejidad, curva aprendizaje, tooling, debugging.
- [ ] Decidir: cuándo usar cada uno según contexto.
- [ ] Documentar decisión (ADR).

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap + presentación comparativa |
| 20 min | Setup: mismo stack en Swarm y kind |
| 10 min | Break |
| 60 min | Ejecución comparativa + métricas |
| 20 min | Análisis resultados + discusión |
| 10 min | Preguntas + checkpoint |

---

## Stack de prueba: mismo compose para ambos

```yaml
# docker-compose.yml (base)
version: '3.9'

services:
  frontend:
    image: ghcr.io/owner/frontend:latest
    ports:
      - "8080:8080"
    networks: [frontend-net]
    deploy:
      replicas: 3
      resources:
        limits: { cpus: '0.5', memory: 256M }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 30s

  api:
    image: ghcr.io/owner/api:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
    secrets: [jwt_secret]
    networks: [frontend-net, backend-net]
    deploy:
      replicas: 3
      resources:
        limits: { cpus: '1.0', memory: 512M }
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', r => {if(r.statusCode!==200) process.exit(1)})"]
      interval: 30s

  worker:
    image: ghcr.io/owner/worker:latest
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
    secrets: [jwt_secret]
    networks: [backend-net]
    deploy:
      replicas: 2
      resources:
        limits: { cpus: '0.5', memory: 256M }

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets: [db_password]
    volumes: [pgdata:/var/lib/postgresql/data]
    networks: [backend-net]
    deploy:
      replicas: 1
      resources:
        limits: { cpus: '1.0', memory: 1G }

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]
    networks: [backend-net]
    deploy:
      replicas: 1
      resources:
        limits: { cpus: '0.25', memory: 256M }

networks:
  frontend-net: { driver: overlay }
  backend-net: { driver: overlay, internal: true }

volumes:
  pgdata: { driver: local }
  redisdata: { driver: local }

secrets:
  db_password: { external: true }
  jwt_secret: { external: true }
```

---

## Métricas a comparar

| Métrica | Swarm | Kubernetes | Herramienta |
|---------|-------|------------|-------------|
| **Tiempo deploy inicial** | `time docker stack deploy` | `time helm install` | stopwatch |
| **Rolling update time** | `docker service update` | `kubectl set image` | stopwatch |
| **Rollback time** | `docker service rollback` | `helm rollback` / `kubectl rollout undo` | stopwatch |
| **Escalado time** | `docker service scale` | `kubectl scale` / HPA | stopwatch |
| **Failover time** | Matar task → reschedule | Matar pod → reschedule | stopwatch |
| **Complejidad configuración** | 1 compose file | Helm chart + values + CRDs | Subjetivo |
| **Debugging** | `docker service logs`, `docker service ps` | `kubectl logs`, `kubectl describe`, `kubectl debug` | Subjetivo |
| **Resource usage (idle)** | `docker stats` | `kubectl top` | monitoring |
| **Network latency** | `hey` load test | `hey` load test | hey |

---

## Ejecución comparativa

### Preparación común

```bash
# 1. Asegurar imágenes en registry
make push  # Del día 1

# 2. Crear secrets
echo "prod-db-pass" | docker secret create db_password -
echo "prod-jwt-secret" | docker secret create jwt_secret -

# 3. Para K8s: crear secrets equivalentes
kubectl create secret generic db-secret \
  --from-literal=db_password=prod-db-pass \
  -n production
kubectl create secret generic jwt-secret \
  --from-literal=jwt_secret=prod-jwt-secret \
  -n production
```

### Test 1: Deploy inicial

```bash
# SWARM
echo "=== SWARM DEPLOY ==="
time docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm
# Esperar healthy
while ! docker stack services curso-swarm | grep -q "3/3"; do sleep 2; done
SWARM_DEPLOY_TIME=$SECONDS

# KUBERNETES (Helm)
echo "=== K8S DEPLOY ==="
time helm install curso-app ./charts/curso-app -n production -f values-prod.yaml --wait --timeout 10m
K8S_DEPLOY_TIME=$SECONDS

echo "Swarm deploy: ${SWARM_DEPLOY_TIME}s"
echo "K8s deploy: ${K8S_DEPLOY_TIME}s"
```

### Test 2: Rolling update

```bash
# SWARM
echo "=== SWARM ROLLING UPDATE ==="
time docker service update --image ghcr.io/owner/api:v1.1.0 curso-swarm_api
# Esperar completado
while docker service ps curso-swarm_api --format "{{.CurrentState}}" | grep -q "Running\|Starting"; do sleep 2; done
SWARM_ROLLING_TIME=$SECONDS

# KUBERNETES
echo "=== K8S ROLLING UPDATE ==="
time kubectl set image deployment/api api=ghcr.io/owner/api:v1.1.0 -n production
kubectl rollout status deployment/api -n production --timeout=300s
K8S_ROLLING_TIME=$SECONDS

echo "Swarm rolling: ${SWARM_ROLLING_TIME}s"
echo "K8s rolling: ${K8S_ROLLING_TIME}s"
```

### Test 3: Rollback

```bash
# SWARM
echo "=== SWARM ROLLBACK ==="
time docker service rollback curso-swarm_api
while docker service ps curso-swarm_api --format "{{.CurrentState}}" | grep -q "Running\|Starting"; do sleep 2; done
SWARM_ROLLBACK_TIME=$SECONDS

# KUBERNETES
echo "=== K8S ROLLBACK ==="
time helm rollback curso-app -n production
# O: kubectl rollout undo deployment/api -n production
kubectl rollout status deployment/api -n production --timeout=300s
K8S_ROLLBACK_TIME=$SECONDS

echo "Swarm rollback: ${SWARM_ROLLBACK_TIME}s"
echo "K8s rollback: ${K8S_ROLLBACK_TIME}s"
```

### Test 4: Escalado

```bash
# SWARM
echo "=== SWARM SCALE ==="
time docker service scale curso-swarm_api=10
while [ $(docker service ps curso-swarm_api --filter desired-state=running -q | wc -l) -lt 10 ]; do sleep 2; done
SWARM_SCALE_TIME=$SECONDS

# KUBERNETES (manual)
echo "=== K8S SCALE MANUAL ==="
time kubectl scale deployment/api --replicas=10 -n production
kubectl rollout status deployment/api -n production --timeout=300s
K8S_SCALE_TIME=$SECONDS

# KUBERNETES (HPA - automático)
echo "=== K8S HPA AUTO ==="
# Generar carga
kubectl run -i --rm load --image=busybox --restart=Never -- sh -c "while true; do wget -q -O- http://api.production:3000/; done" &
# Esperar HPA
sleep 60
kubectl get hpa api-hpa -n production
```

### Test 5: Failover

```bash
# SWARM
echo "=== SWARM FAILOVER ==="
TASK=$(docker service ps curso-swarm_api -q | head -1)
CID=$(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK)
time docker kill $CID
# Esperar nuevo task running
while ! docker service ps curso-swarm_api --format "{{.CurrentState}}" | grep -q "Running"; do sleep 1; done
SWARM_FAILOVER_TIME=$SECONDS

# KUBERNETES
echo "=== K8S FAILOVER ==="
POD=$(kubectl get pods -n production -l app=api -o jsonpath='{.items[0].metadata.name}')
time kubectl delete pod $POD -n production
kubectl wait --for=condition=Ready pod -l app=api -n production --timeout=60s
K8S_FAILOVER_TIME=$SECONDS

echo "Swarm failover: ${SWARM_FAILOVER_TIME}s"
echo "K8s failover: ${K8S_FAILOVER_TIME}s"
```

### Test 6: Load test (hey)

```bash
# Instalar hey
go install github.com/rakyll/hey@latest

# SWARM (port forwarding)
docker service update --publish-add published=8080,target=8080,mode=ingress curso-swarm_frontend
hey -n 10000 -c 50 http://localhost:8080/ > swarm-load.txt

# KUBERNETES
kubectl port-forward -n production svc/frontend 8080:8080 &
hey -n 10000 -c 50 http://localhost:8080/ > k8s-load.txt

# Comparar
echo "=== LOAD TEST RESULTS ==="
echo "Swarm:"
grep -E "Requests/sec|Latency|p99" swarm-load.txt
echo "K8s:"
grep -E "Requests/sec|Latency|p99" k8s-load.txt
```

---

## Resultados esperados (referencia)

| Métrica | Swarm | Kubernetes | Ganador |
|---------|-------|------------|---------|
| **Deploy inicial** | ~30s | ~90s (Helm) | Swarm |
| **Rolling update** | ~45s | ~60s | Swarm |
| **Rollback** | ~15s | ~30s (Helm) | Swarm |
| **Escalado manual** | ~20s | ~30s | Swarm |
| **Escalado auto (HPA)** | N/A | ~60s (reactivo) | K8s |
| **Failover** | ~10s | ~15s | Swarm |
| **Load test (req/s)** | ~12,000 | ~11,500 | Similar |
| **Latencia p99** | ~15ms | ~18ms | Similar |
| **Complejidad config** | Baja (1 file) | Alta (chart + values) | Swarm |
| **Debugging** | Básico | Avanzado | K8s |
| **Ecosistema** | Limitado | Masivo | K8s |
| **Multi-cloud** | Sí | Sí | Empate |
| **Service Mesh** | No nativo | Istio, Linkerd, Cilium | K8s |
| **GitOps** | Básico | ArgoCD, Flux | K8s |

---

## Análisis cualitativo

### Swarm: puntos fuertes

```
✅ Simplicidad: docker-compose.yml nativo, mismo formato dev/prod
✅ Curva aprendizaje: mínima si ya sabes Docker
✅ Deploy rápido: segundos, no minutos
✅ Rolling updates: simples, predecibles
✅ Integración Docker: secrets, configs, networks nativos
✅ Suficiente para: equipos pequeños, apps simples, single-cloud
```

### Swarm: limitaciones

```
❌ Ecosistema limitado: pocos tools, pocos integrations
❌ No GitOps nativo: no ArgoCD/Flux
❌ No Service Mesh: no mTLS, no traffic splitting avanzado
❌ Escalado cluster: manual (añadir nodes)
❌ Multi-tenancy: namespaces básicos, no RBAC granular
❌ Observabilidad: logs/metrics básicos, no ecosystem
❌ Scheduling avanzado: no topology spread, no priority classes
❌ Extensibilidad: no CRDs, no operators
```

### Kubernetes: puntos fuertes

```
✅ Estándar de facto: cloud-agnostic, vendor-neutral
✅ Ecosistema masivo: Helm, Operators, CRDs, GitOps
✅ Service Mesh: Istio, Linkerd, Cilium (mTLS, traffic management)
✅ GitOps nativo: ArgoCD, Flux (declarativo, auditable)
✅ Scheduling avanzado: affinity, taints, topology spread, priority
✅ Autoscaling: HPA, VPA, Cluster Autoscaler, KEDA
✅ Multi-tenancy: RBAC, NetworkPolicy, ResourceQuota, LimitRange
✅ Extensibilidad: CRDs, Operators, Admission Controllers
✅ Observabilidad: Prometheus, Loki, Tempo, OpenTelemetry
✅ Community: CNCF, miles de contributors, docs infinitas
```

### Kubernetes: limitaciones

```
❌ Complejidad: curva aprendizaje empinada
✅ Overhead: control plane (3 masters mínimo HA), etcd
✅ Deploy más lento: Helm, manifests, CRDs
✅ Debugging: más capas (pod, deployment, service, ingress, CNI)
✅ Costo infra: más recursos para control plane
✅ Operación: requiere expertise dedicado (SRE/Platform team)
```

---

## Matriz de decisión

| Criterio | Swarm | Kubernetes |
|----------|-------|------------|
| **Tamaño equipo** | < 10 devs | > 10 devs |
| **Apps** | Simples, monolíticas, few services | Microservicios, complejas, many services |
| **Tráfico** | Predecible, bajo/medio | Variable, alto, picos |
| **Cloud** | Single, on-prem | Multi-cloud, hybrid |
| **Compliance** | Básico | Avanzado (RBAC, audit, policies) |
| **Team skills** | Docker-only | Dispuestos a aprender K8s |
| **Timeline** | Necesitan producción ayer | Pueden invertir 2-3 meses |
| **Budget** | Limitado (menos infra) | Pueden absorber overhead |

### Recomendación por fase

| Fase | Recomendación |
|------|---------------|
| **MVP / Startup** | Docker Compose → Swarm |
| **Growth (10-50 services)** | Swarm → Kubernetes (migración gradual) |
| **Scale (50+ services)** | Kubernetes (EKS/GKE/AKS) |
| **Enterprise** | Kubernetes (managed) + GitOps + Service Mesh |

---

## Laboratorio autónomo: Migración Swarm → K8s

### Tarea: Migrar stack real

```bash
# 1. Exportar stack Swarm actual
docker stack services curso-swarm --format "{{.Name}} {{.Image}} {{.Replicas}}" > swarm-stack.txt

# 2. Convertir con kompose
kompose convert -f docker-compose.yml -f docker-compose.prod.yml -o k8s-migration/

# 3. Revisar y ajustar manifests
# - Añadir: Ingress, HPA, PDB, NetworkPolicy, ResourceQuota
# - Separar: base/, overlays/dev/, overlays/prod/ (Kustomize)

# 4. Crear Helm chart desde manifests
helm create curso-app-migrated
# Copiar templates ajustados a curso-app-migrated/templates/

# 5. Test en kind
kind create cluster --name migration-test
helm install test ./curso-app-migrated -n test --create-namespace

# 6. Validar paridad funcional
# - Mismos endpoints responden
# - Mismos healthchecks pasan
# - Mismos logs estructurados
# - Métricas equivalentes
```

---

## ADR Template: Decisión de orquestador

```markdown
# ADR 004: Container Orchestration Platform

## Status
Accepted

## Context
Need to choose orchestration platform for production workloads.

## Decision
**Phase 1 (Months 1-6): Docker Swarm**
- Rationale: Team knows Docker, fast deploy, sufficient for current scale (5 services)
- Criteria to migrate: >10 services, need GitOps, multi-cloud, service mesh

**Phase 2 (Month 6+): Kubernetes (EKS/GKE)**
- Rationale: Standard, ecosystem, GitOps, service mesh, advanced scheduling
- Migration path: Kompose → Helm → ArgoCD

## Consequences
- Swarm: Technical debt accepted, migration planned
- K8s: Investment in learning, tooling, platform team
- Hybrid period: Both running during migration

## Alternatives considered
- Nomad: Rejected (less ecosystem)
- ECS: Rejected (AWS lock-in)
- Raw K8s from start: Rejected (team not ready)
```

---

## Checkpoint validación

```bash
# validate.sh lab-4-4
#!/usr/bin/env bash
set -euo pipefail

echo "1. Swarm stack deploy..."
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml test-swarm
sleep 15
docker stack services test-swarm | grep -q "3/3"
docker stack rm test-swarm

echo "2. K8s Helm deploy..."
kind create cluster --name test-k8s --config .github/kind-config.yaml
helm install test ./charts/curso-app -n test --create-namespace -f values-prod.yaml --wait --timeout 5m
kubectl get pods -n test | grep -q Running
kind delete cluster --name test-k8s

echo "3. Rolling update ambos..."
# Verificar que ambos soportan rolling update sin downtime
echo "   Verificar manualmente: zero-downtime deploy"

echo "4. Rollback ambos..."
echo "   Verificar manualmente: rollback < 30s"

echo "5. Escalado ambos..."
echo "   Verificar manualmente: scale up/down funcional"

echo "6. Failover ambos..."
echo "   Verificar manualmente: kill task/pod → reschedule < 30s"

echo "✅ Checkpoint 4.4 superado"
```

---

## Recursos post-sesión

- [Docker Swarm vs Kubernetes](https://docs.docker.com/engine/swarm/swarm-tutorial/)
- [Migrating from Swarm to Kubernetes](https://kompose.io/)
- [Helm vs Kustomize](https://github.com/helm/helm/blob/main/docs/faq.md#what-is-the-difference-between-helm-and-kustomize)
- [GitOps with ArgoCD](https://argo-cd.readthedocs.io/)
- [Service Mesh comparison](https://servicemesh.es/)
- [Kubernetes the Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way)