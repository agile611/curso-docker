# Proyecto Final Integrador

## Visión general

El proyecto final integra todos los aprendizajes del curso en una aplicación cohesiva lista para producción. No es un ejercicio académico: es un **stack real** que podrías desplegar mañana en tu empresa.

### Aplicación: "TaskFlow" - Gestión de tareas colaborativa

| Componente | Tecnología | Puerto | Descripción |
|------------|------------|--------|-------------|
| **Frontend** | React 18 + Vite + Nginx | 8080 | SPA con dashboard, kanban, tiempo real |
| **API** | Node.js 20 + Express + Prisma | 3000 | REST API, auth JWT, WebSockets |
| **Worker** | Python 3.12 + Celery + Redis | - | Procesamiento async: emails, reportes, notificaciones |
| **Base de datos** | PostgreSQL 16 | 5432 | Datos relacionales, migraciones Prisma |
| **Cache/Colas** | Redis 7 | 6379 | Cache, colas BullMQ, sesiones, rate limiting |

### Arquitectura objetivo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TASKFLOW - PRODUCCIÓN                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │   USUARIOS  │    │  ADMIN/     │    │  CI/CD      │                    │
│  │  (Navegador)│    │  SRE        │    │  (GitHub)   │                    │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                    │
│         │                  │                  │                           │
│         ▼                  ▼                  ▼                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    INGRESS (NGINX / CLOUD LB)                       │  │
│  │  TLS termination, rate limiting, WAF, routing                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         │                  │                  │                           │
│    ┌────┴────┐        ┌────┴────┐        ┌────┴────┐                    │
│    ▼         ▼        ▼         ▼        ▼         ▼                    │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│ │Front │ │Front │ │ API  │ │ API  │ │Worker│ │Worker│  (HPA: 3-20)     │
│ │  1   │ │  2   │ │  1   │ │  2   │ │  1   │ │  2   │                  │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                  │
│    │         │        │        │        │        │                       │
│    └─────────┼────────┼────────┼────────┼────────┘                       │
│              ▼        ▼        ▼        ▼                               │
│       ┌─────────────┐  ┌─────────────┐                                  │
│       │ PostgreSQL  │  │   Redis     │                                  │
│       │  (Primary)  │  │  (Cluster)  │                                  │
│       │  + Replicas │  │  6 nodes    │                                  │
│       └─────────────┘  └─────────────┘                                  │
│              │                              │                            │
│              ▼                              ▼                            │
│       ┌─────────────────────────────────────────────┐                   │
│       │           OBSERVABILIDAD                    │                   │
│       │  Prometheus │ Grafana │ Loki │ Tempo        │                   │
│       └─────────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Entregables obligatorios

### 1. Código e Infraestructura (repo Git)

```
taskflow/
├── .github/workflows/ci.yml          # Pipeline completo
├── .github/workflows/cd.yml          # Deploy staging/prod
├── apps/
│   ├── frontend/                     # React + Nginx
│   ├── api/                          # Node.js/Express
│   └── worker/                       # Python/Celery
├── charts/taskflow/                  # Helm chart
├── docker-compose.yml                # Base
├── docker-compose.override.yml       # Dev
├── docker-compose.prod.yml           # Swarm prod
├── Makefile                          # Targets unificados
└── README.md                         # Con badges
```

### 2. Documentación (docs/)

```
docs/
├── adr/                              # 5 ADRs
├── runbooks/                         # 6 runbooks
├── screenshots/                      # 6+ capturas Grafana
├── architecture/                     # 6 diagramas C4 (Mermaid)
└── README.md                         # Índice documentación
```

### 3. Presentación (10 min + 5 min demo)

- Slides: arquitectura, decisiones, pipeline, métricas
- Demo en vivo: deploy staging → smoke test → observabilidad
- Q&A: 5 min

---

## Criterios de evaluación

| Área | Peso | Criterios clave |
|------|------|-----------------|
| **Dockerfiles** | 20% | Multi-stage, non-root, read-only, healthcheck, build secrets, hadolint 0 warnings, dive >90%, multi-arch |
| **Compose/Helm** | 20% | Base/override/prod/ci, healthchecks, resources, secrets, HPA, PDB, hooks, subcharts |
| **Pipeline CI/CD** | 20% | Lint→build→test→scan→sign→deploy, Trivy HIGH/CRITICAL=fail, cosign keyless, SLSA, SBOM |
| **Observabilidad** | 15% | Prometheus/Grafana/Loki/Tempo, dashboards custom, alertas, ServiceMonitor |
| **Pruebas** | 10% | Unit, integración (testcontainers), caos (litmus), contract |
| **Documentación** | 10% | 5 ADRs, 6 runbooks, diagramas C4, screenshots, README |
| **Presentación** | 5% | 10 min + demo, claridad, dominio técnico, Q&A |

**Aprobado:** ≥ 70% global y ≥ 60% en cada área.

---

## Casos de uso a implementar

### CU-01: Gestión de tableros Kanban
- Crear/editar/eliminar tableros
- Columnas personalizables
- Drag & drop tareas entre columnas
- Tiempo real (WebSockets)

### CU-02: Autenticación y autorización
- Registro/login con email/password
- JWT access + refresh tokens
- Roles: admin, member, viewer
- OAuth2: GitHub, Google (opcional)

### CU-03: Tareas y subtareas
- CRUD tareas: título, descripción, prioridad, etiquetas, fecha límite
- Subtareas anidadas
- Asignación a usuarios
- Comentarios y menciones

### CU-04: Procesamiento asíncrono
- Envío emails (bienvenida, notificaciones, recordatorios)
- Generación reportes PDF/Excel
- Webhooks salientes (integraciones)
- Reintentos con backoff exponencial

### CU-05: Observabilidad operacional
- Métricas: throughput, latency, error rate, saturation
- Logs: structured JSON, correlation IDs, niveles
- Traces: request flow end-to-end
- Alertas: SEV-1/2/3 con runbooks

---

## Timeline día 5

| Bloque | Horario | Actividad |
|--------|---------|-----------|
| 1 | 09:00–10:30 | Refactor final: Dockerfiles, Compose, Helm, Pipeline |
| 2 | 10:45–12:15 | Pruebas: suite completa + chaos engineering |
| 3 | 12:15–13:00 | **Laboratorio 5.1:** Ejecución pipeline completo |
| 4 | 14:00–15:30 | Documentación: ADRs, runbooks, diagramas, screenshots |
| 5 | 15:45–17:15 | Preparación presentación + ensayo demo |
| 6 | 17:15–18:00 | **Presentaciones finales** + retrospectiva + certificación |

---

## Laboratorio 5.1: Pipeline completo end-to-end

### Objetivo
Ejecutar el pipeline completo desde commit hasta staging deploy, validando cada etapa.

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

### Checklist validación final

```bash
# validate-final.sh
#!/usr/bin/env bash
set -euo pipefail

echo "=== VALIDACIÓN FINAL PROYECTO ==="

# 1. Repo structure
echo "1. Estructura repo..."
[[ -f .github/workflows/ci.yml ]] || exit 1
[[ -f .github/workflows/cd.yml ]] || exit 1
[[ -d apps/frontend && -d apps/api && -d apps/worker ]] || exit 1
[[ -d charts/taskflow ]] || exit 1
[[ -f docker-compose.yml ]] || exit 1
[[ -f Makefile ]] || exit 1

# 2. Dockerfiles
echo "2. Dockerfiles hardened..."
for svc in frontend api worker; do
  grep -q '^USER ' apps/$svc/Dockerfile || exit 1
  grep -q 'HEALTHCHECK' apps/$svc/Dockerfile || exit 1
  grep -q 'cap_drop.*ALL' apps/$svc/Dockerfile || echo "⚠️ cap_drop en runtime"
  hadolint --failure-threshold=warning apps/$svc/Dockerfile || exit 1
done

# 3. Helm chart
echo "3. Helm chart..."
[[ -f charts/taskflow/Chart.yaml ]] || exit 1
[[ -f charts/taskflow/values-prod.yaml ]] || exit 1
helm template test charts/taskflow -n production -f values-prod.yaml >/dev/null || exit 1

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

# 7. Presentación
echo "7. Presentación preparada..."
echo "   Slides + demo script listos"

echo "✅ PROYECTO FINAL VALIDADO"
```

---

## Recursos para el proyecto

### Código base (proporcionado)
- `apps/frontend/`: React + Vite + Nginx (package.json, src/, nginx.conf)
- `apps/api/`: Node.js + Express + Prisma (package.json, prisma/schema.prisma, src/)
- `apps/worker/`: Python + Celery (pyproject.toml, src/)

### Herramientas disponibles
- GitHub Actions (CI/CD)
- GHCR (Registry)
- Kind/k3d (K8s local)
- Helm (Package manager)
- Prometheus/Grafana/Loki/Tempo (Observabilidad)
- Trivy/Cosign/Syft (Seguridad)
- Testcontainers/Litmus (Testing)

### Referencias rápidas
- [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Helm chart template guide](https://helm.sh/docs/chart_template_guide/)
- [Kubernetes API reference](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.28/)
- [Prometheus querying](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Loki LogQL](https://grafana.com/docs/loki/latest/query/)
- [Tempo TraceQL](https://grafana.com/docs/tempo/latest/traceql/)

---

## Preguntas frecuentes

**P: ¿Puedo usar otra aplicación distinta a TaskFlow?**
R: Sí, mientras tenga al menos 3 servicios (frontend, API, worker) con BD y cache, y cubra todos los requisitos técnicos.

**P: ¿Es obligatorio usar Kind o puedo usar k3d/EKS/GKE?**
R: Kind es el estándar del curso para reproducibilidad. Puedes usar k3d si prefieres, o cloud managed para staging/prod.

**P: ¿Qué pasa si no tengo tiempo para instrumentar traces (Tempo)?**
R: Métricas + Logs son obligatorios. Traces son "nice to have" pero se evalúan positivamente.

**P: ¿Puedo presentar en pareja?**
R: El proyecto es individual. La presentación es individual (10 min cada uno).

**P: ¿Qué pasa si el pipeline falla en CI?**
R: Tienes hasta 48h post-curso para arreglar y volver a empujar. La evaluación considera el estado final.

---

## Contacto y soporte

- **Canal Slack del curso**: #curso-docker-proyecto-final
- **Email instructor**: guillem@agile611.com
- **Horas oficina**: Viernes 18:00-19:00 (post-curso, 2 semanas)
- **Repo template**: https://github.com/agile611/curso-docker-template