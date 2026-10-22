# Plantillas del curso

Índice de plantillas reutilizables para el curso Docker Fundamentals.

## Dockerfiles

| Plantilla | Descripción | Uso |
|-----------|-------------|-----|
| [Dockerfile base](dockerfile-base.md) | Single-stage simple para desarrollo | Apps simples, learning |
| [Dockerfile multi-stage](dockerfile-multistage.md) | Builder → Runtime optimizado | **Producción (recomendado)** |
| [Dockerfile distroless](dockerfile-distroless.md) | Runtime minimal (Google distroless) | Máxima seguridad, tamaño mínimo |
| [Dockerfile scratch](dockerfile-scratch.md) | Solo binario estático (Go/Rust) | Microservicios Go/Rust |

## Docker Compose

| Plantilla | Descripción |
|-----------|-------------|
| [docker-compose.yml](docker-compose.yml) | Base production-ready |
| [docker-compose.override.yml](docker-compose-override.yml) | Desarrollo con hot reload |
| [docker-compose.prod.yml](docker-compose-prod.yml) | Swarm production deploy |
| [docker-compose.ci.yml](docker-compose-ci.yml) | CI testing con tmpfs |

## Configuración

| Plantilla | Descripción |
|-----------|-------------|
| [.dockerignore](dockerignore.md) | Patrones optimizados por lenguaje |
| [.hadolint.yaml](hadolint.yaml) | Configuración hadolint del equipo |
| [.yamllint.yml](yamllint.yml) | Configuración yamllint |
| [.trivyignore](trivyignore.md) | Excepciones documentadas Trivy |
| [.sops.yaml](sops.yaml) | Configuración SOPS por repo |

## Kubernetes / Helm

| Plantilla | Descripción |
|-----------|-------------|
| [Helm Chart.yaml](helm-chart.yaml) | Metadatos chart con dependencias |
| [Helm values.yaml](helm-values.yaml) | Valores por defecto completos |
| [Helm _helpers.tpl](helm-helpers.tpl) | Funciones reutilizables |
| [K8s Deployment](k8s-deployment.yaml) | Deployment production-ready |
| [K8s Service](k8s-service.yaml) | Service + Ingress |
| [K8s HPA](k8s-hpa.yaml) | HorizontalPodAutoscaler |
| [K8s PDB](k8s-pdb.yaml) | PodDisruptionBudget |

## CI/CD

| Plantilla | Descripción |
|-----------|-------------|
| [GitHub Actions CI](github-actions-ci.yml) | Pipeline completo lint→build→test→scan→sign |
| [GitHub Actions CD](github-actions-cd.yml) | Deploy staging/prod con approval |
| [Dependabot](dependabot.yml) | Actualizaciones automáticas |

## Seguridad

| Plantilla | Descripción |
|-----------|-------------|
| [Trivy policy Rego](trivy-policy.rego) | Policy gates custom |
| [Cosign verify script](cosign-verify.sh) | Verificación firmas automatizada |
| [SBOM generate script](sbom-generate.sh) | Generación SBOM automatizada |

## Documentación

| Plantilla | Descripción |
|-----------|-------------|
| [ADR template](adr-template.md) | Architecture Decision Record |
| [Runbook template](runbook-template.md) | Runbook operacional estándar |
| [Post-mortem template](postmortem-template.md) | Plantilla post-mortem |
| [README template](readme-template.md) | README con badges estándar |

---

## Uso rápido

```bash
# Copiar plantilla Dockerfile multi-stage
cp docs/plantillas/dockerfile-multistage.md apps/mi-servicio/Dockerfile

# Editar placeholders: {{SERVICE_NAME}}, {{PORT}}, {{BASE_IMAGE}}, etc.

# Validar
hadolint apps/mi-servicio/Dockerfile
docker build -t mi-servicio:test apps/mi-servicio
```