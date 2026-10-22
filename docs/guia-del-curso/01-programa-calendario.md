# Programa y calendario

## Visión general

| Día | Fecha | Horario | Tema principal |
|-----|-------|---------|----------------|
| 1 | Lunes | 09:00–14:00 / 15:00–18:00 | Fundamentos y ciclo de vida |
| 2 | Martes | 09:00–14:00 / 15:00–18:00 | Redes, almacenamiento y Compose |
| 3 | Miércoles | 09:00–14:00 / 15:00–18:00 | Seguridad, buenas prácticas y CI/CD |
| 4 | Jueves | 09:00–14:00 / 15:00–18:00 | Orquestación y producción |
| 5 | Viernes | 09:00–14:00 / 15:00–18:00 | Proyecto final integrador |

**Total:** 30 horas lectivas (6h/día × 5 días)

---

## Día 1 · Fundamentos y ciclo de vida

| Bloque | Horario | Contenido |
|--------|---------|-----------|
| 1.1 | 09:00–10:30 | Introducción: contenedores vs VMs, arquitectura Docker (client, daemon, registry), OCI |
| 1.2 | 10:45–12:15 | Imágenes: capas, union filesystem, cache, tags, digests, multi-arch |
| 1.3 | 12:15–13:00 | **Laboratorio 1.1:** Pull, run, inspect, commit, tag, push a registry |
| 1.4 | 14:00–15:30 | Dockerfile: instrucciones esenciales, mejores prácticas, .dockerignore |
| 1.5 | 15:45–17:15 | Multi-stage builds: builder pattern, distroless, scratch, optimización de capas |
| 1.6 | 17:15–18:00 | **Laboratorio 1.2:** Dockerfile multi-stage para app Go/Node/Python + publish |

**Entregable día 1:** Dockerfile multi-stage optimizado en repo Git con GitHub Actions que hace build y push.

---

## Día 2 · Redes, almacenamiento y Compose

| Bloque | Horario | Contenido |
|--------|---------|-----------|
| 2.1 | 09:00–10:30 | Networking: bridge, host, none, overlay, DNS interno, service discovery |
| 2.2 | 10:45–12:15 | Almacenamiento: volúmenes named, bind mounts, tmpfs, drivers, backup/restore |
| 2.3 | 12:15–13:00 | **Laboratorio 2.1:** Crear red overlay, montar volúmenes, persistir datos PostgreSQL |
| 2.4 | 14:00–15:30 | Docker Compose v2: servicios, networks, volumes, configs, secrets, profiles, extends |
| 2.5 | 15:45–17:15 | Compose en producción: override files, env_file, healthchecks, deploy, resource limits |
| 2.6 | 17:15–18:00 | **Laboratorio 2.2:** Stack completo (frontend, API, DB, worker) con compose.yml + override |

**Entregable día 2:** `docker-compose.yml` + `docker-compose.prod.yml` versionados, probados con `docker compose up -d`.

---

## Día 3 · Seguridad, buenas prácticas y CI/CD

| Bloque | Horario | Contenido |
|--------|---------|-----------|
| 3.1 | 09:00–10:30 | Hardening: non-root user, read-only rootfs, capabilities, seccomp, AppArmor, gVisor/Kata |
| 3.2 | 10:45–12:15 | Secrets: build secrets (BuildKit), runtime secrets (compose/swarm/k8s), SOPS, Vault intro |
| 3.3 | 12:15–13:00 | **Laboratorio 3.1:** Dockerfile non-root + read-only + build secret para npm token |
| 3.4 | 14:00–15:30 | Escaneo: Docker Scout, Trivy, Syft/Grype, SBOM (SPDX/CycloneDX), policy gates |
| 3.5 | 15:45–17:15 | CI/CD: GitHub Actions / GitLab CI - build, test, lint (hadolint), scan, sign (cosign), push multi-arch |
| 3.6 | 17:15–18:00 | **Laboratorio 3.2:** Pipeline completo con matrix strategy (amd64/arm64), attestation, deploy staging |

**Entregable día 3:** Pipeline CI/CD funcional en `.github/workflows/ci.yml` con badge de estado en README.

---

## Día 4 · Orquestación y producción

| Bloque | Horario | Contenido |
|--------|---------|-----------|
| 4.1 | 09:00–10:30 | Docker Swarm: init, services, stacks, secrets, configs, routing mesh, rollback |
| 4.2 | 10:45–12:15 | Kubernetes intro: kind/k3d, kubectl, pods, services, deployments, ingress, HPA |
| 4.3 | 12:15–13:00 | **Laboratorio 4.1:** Desplegar stack compose en Swarm + migrar a kind |
| 4.4 | 14:00–15:30 | Helm: charts, values, templates, dependencies, releases, rollback, OCI registry |
| 4.5 | 15:45–17:15 | Observabilidad: logging (loki/fluentd), métricas (prometheus/grafana), tracing (tempo/jaeger) |
| 4.6 | 17:15–18:00 | **Laboratorio 4.2:** Helm chart para la app + deploy en kind + dashboards Grafana |

**Entregable día 4:** Helm chart versionado en `charts/mi-app` + `values-prod.yaml` + capturas de dashboards.

---

## Día 5 · Proyecto final integrador

| Bloque | Horario | Contenido |
|--------|---------|-----------|
| 5.1 | 09:00–10:30 | Revisión y refactor: optimizar Dockerfiles, compose, pipeline, Helm chart |
| 5.2 | 10:45–12:15 | Pruebas de integración: testcontainers, contract testing, chaos engineering (litmus/gremlin) |
| 5.3 | 12:15–13:00 | **Laboratorio 5.1:** Ejecutar suite completa en pipeline + validar en staging |
| 5.4 | 14:00–15:30 | Documentación: ADR, runbooks, diagramas (C4/mermaid), README, CHANGELOG |
| 5.5 | 15:45–17:15 | Preparación de presentación: demo en vivo, métricas, lecciones aprendidas |
| 5.6 | 17:15–18:00 | **Presentaciones finales** + retrospectiva + certificación |

**Entregable final:** Repositorio completo con:
- `Dockerfile` optimizado multi-arch
- `docker-compose.yml` + overrides
- `.github/workflows/ci.yml` + `cd.yml`
- `charts/mi-app/` Helm chart
- `docs/` con ADR, runbooks, arquitectura
- `README.md` con badges, quickstart, arquitectura
- Presentación 10 min + demo

---

## Carga de trabajo estimada fuera de clase

| Actividad | Horas estimadas |
|-----------|-----------------|
| Repaso de conceptos y documentación oficial | 5–8 h |
| Práctica adicional de laboratorios | 4–6 h |
| Proyecto final (integración y pulido) | 6–10 h |
| **Total extra** | **15–24 h** |

---

## Fechas clave

- **Inicio:** Lunes, Día 1
- **Entrega intermedia (Día 3):** Pipeline CI/CD funcional
- **Entrega final (Día 5, 17:00):** Repositorio completo + presentación
- **Ventana de gracia:** +48h para pulir documentación tras el curso