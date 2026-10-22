# Objetivos de aprendizaje

Al finalizar el curso, los participantes serán capaces de:

## Conocimientos (Saber)

- [ ] **Explicar** la arquitectura de Docker: cliente, daemon, containerd, runc, registry, OCI runtime spec.
- [ ] **Diferenciar** imagen vs contenedor, capa vs layer, tag vs digest, manifest vs index.
- [ ] **Describir** el modelo de red de Docker: bridge, host, overlay, macvlan, IPv6, DNS interno.
- [ ] **Enumerar** tipos de almacenamiento: named volumes, bind mounts, tmpfs, storage drivers (overlay2, zfs, btrfs).
- [ ] **Identificar** vectores de ataque comunes: root en contenedor, secrets en capas, socket Docker expuesto, supply chain.
- [ ] **Comparar** orquestadores: Swarm mode, Kubernetes, Nomad, ECS - cuándo usar cada uno.

## Habilidades (Saber hacer)

### Día 1 - Fundamentos
- [ ] Construir imágenes eficientes con `Dockerfile` usando multi-stage builds.
- [ ] Aplicar `.dockerignore` para reducir contexto de build.
- [ ] Etiquetar y versionar imágenes con semver + git SHA.
- [ ] Publicar imágenes en Docker Hub, GHCR, o registry privado.
- [ ] Inspeccionar capas con `docker history`, `dive`, `docker image inspect`.

### Día 2 - Redes, almacenamiento y Compose
- [ ] Diseñar topologías de red para microservicios (frontend ↔ API ↔ DB).
- [ ] Configurar volúmenes persistentes para bases de datos con backup/restore.
- [ ] Escribir `docker-compose.yml` production-ready con healthchecks, resource limits, secrets.
- [ ] Usar `docker compose override` para entornos dev/staging/prod.
- [ ] Depurar redes con `docker network inspect`, `nsenter`, `tcpdump`.

### Día 3 - Seguridad y CI/CD
- [ ] Crear usuarios no-root en Dockerfile (`USER 1000:1000`).
- [ ] Configurar `read-only` rootfs y `tmpfs` para writable paths.
- [ ] Usar BuildKit secrets (`--mount=type=secret`) para tokens de build.
- [ ] Escanear vulnerabilidades con Trivy/Docker Scout y generar SBOM.
- [ ] Firmar imágenes con cosign (keyless) y verificar en pipeline.
- [ ] Construir pipeline CI/CD multi-arch (amd64/arm64) con cache layers.

### Día 4 - Orquestación y producción
- [ ] Desplegar stack en Docker Swarm con `docker stack deploy`.
- [ ] Crear clúster local Kubernetes con kind/k3d.
- [ ] Escribir Helm chart con values, templates, helpers, dependencies.
- [ ] Configurar Ingress, TLS, HPA, PodDisruptionBudget.
- [ ] Implementar observabilidad: logging centralizado, métricas RED/USE, distributed tracing.

### Día 5 - Proyecto integrador
- [ ] Refactorizar todo el stack aplicando feedback de revisiones.
- [ ] Ejecutar pruebas de integración en pipeline (testcontainers).
- [ ] Documentar arquitectura con diagramas C4 (Mermaid/Structurizr).
- [ ] Escribir runbooks de operaciones comunes (rollback, scale, disaster recovery).
- [ ] Presentar demo técnica de 10 min con métricas y lecciones aprendidas.

## Actitudes (Saber ser)

- [ ] **Cultura de seguridad por defecto**: no-root, least privilege, scan continuo.
- [ ] **Reproducibilidad**: builds deterministas, versionado semántico, SBOM.
- [ ] **Observabilidad first**: logs estructurados, métricas, traces desde el día 1.
- [ ] **Automatización**: todo lo que se hace dos veces se scriptea/pipelinea.
- [ ] **Documentación viva**: ADR, runbooks, diagramas versionados con el código.
- [ ] **Cost-awareness**: multi-stage, distroless, layer cache, limpieza regular.

---

## Mapa de competencias por rol

| Competencia | Dev | DevOps/SRE | Platform | SecOps |
|-------------|-----|------------|----------|--------|
| Dockerfile avanzado | ★★★ | ★★★ | ★★☆ | ★★☆ |
| Compose / Stack | ★★★ | ★★★ | ★★☆ | ★☆☆ |
| CI/CD pipelines | ★★☆ | ★★★ | ★★★ | ★★☆ |
| Hardening / Scan | ★★☆ | ★★★ | ★★★ | ★★★ |
| Kubernetes / Helm | ★☆☆ | ★★★ | ★★★ | ★★☆ |
| Observabilidad | ★★☆ | ★★★ | ★★★ | ★★☆ |
| Supply chain security | ★☆☆ | ★★☆ | ★★★ | ★★★ |

★ = Básico · ★★ = Intermedio · ★★★ = Avanzado

---

## Criterios de evaluación

| Entregable | Peso | Criterios clave |
|------------|------|-----------------|
| Laboratorios diarios (1-4) | 40% | Funcionalidad, buenas prácticas, limpieza, commits atómicos |
| Pipeline CI/CD (Día 3) | 15% | Multi-arch, scan, sign, deploy staging, badge |
| Helm chart + deploy kind (Día 4) | 15% | Chart bien estructurado, values separadas, healthchecks, observabilidad |
| Proyecto final (Día 5) | 30% | Integración completa, documentación, demo, presentación, retrospectiva |

**Aprobado:** ≥ 70% global y ≥ 60% en cada entregable individual.