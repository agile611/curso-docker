# Día 1 - 01: Introducción y diagnóstico

## Objetivos de la sesión

- [ ] Conocer al grupo y nivel base.
- [ ] Entender qué es un contenedor y cómo difiere de VM y proceso nativo.
- [ ] Ver la arquitectura Docker (CLI, daemon, containerd, runc, BuildKit).
- [ ] Ejecutar primeros comandos: pull, run, ps, logs, inspect, rm, rmi.
- [ ] Autoevaluación de conocimientos previos.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 15 min | Presentaciones + encuesta rápida (Mentimeter/Forms) |
| 30 min | Teoría: contenedores vs VMs, namespaces, cgroups, union FS |
| 15 min | Demo en vivo: `docker run`, `docker exec`, `docker inspect` |
| 30 min | Laboratorio guiado 1.1 (ver [índice día 1](index.md)) |
| 15 min | Preguntas + autoevaluación escrita (5 preguntas) |
| 15 min | Break |

---

## Encuesta diagnóstica (ejemplo preguntas)

1. **¿Has usado Docker antes?**
   - Nunca / Solo `docker run` / Escribo Dockerfiles / Uso Compose / CI/CD con Docker

2. **¿Conoces la diferencia entre imagen y contenedor?**
   - No / Vaga / Clara / Podría explicarla

3. **¿Qué es un namespace de Linux?**
   - No sé / He oído el término / Sé listar algunos / Uso `lsns` / `unshare`

4. **¿Has escrito un Dockerfile multi-stage?**
   - Nunca / Copiado de internet / Sí, entiendo el patrón / Lo uso habitualmente

5. **¿Usas BuildKit / Buildx?**
   - No / Sí, `DOCKER_BUILDKIT=1` / Sí, `docker buildx` habitualmente

6. **¿Conoces OCI (Open Container Initiative)?**
   - No / Nombre solo / image-spec / runtime-spec / Ambas

7. **¿Has publicado imágenes en un registry?**
   - Nunca / Docker Hub / GHCR / Registry privado (Harbor, Artifactory, ECR)

8. **¿Has escaneado vulnerabilidades en imágenes?**
   - Nunca / `docker scan` / Trivy / Docker Scout / Syft/Grype

9. **¿Has usado Kubernetes?**
   - Nunca / `kubectl` básico / Deployments/Services / Helm / Operador/CKA

10. **¿Cuál es tu objetivo principal en este curso?**
    - (Abierta)

---

## Conceptos clave: contenedores vs VMs vs Procesos

| Característica | Proceso nativo | Contenedor | Máquina Virtual |
|----------------|----------------|------------|-----------------|
| **Aislamiento** | Ninguno | Procesos (namespaces) + recursos (cgroups) | Hardware completo (hypervisor) |
| **Kernel** | Host | Host (compartido) | Guest (propio) |
| **Arranque** | ms | ms–s | min |
| **Overhead CPU/RAM** | 0% | ~1-2% | 10-20% |
| **Densidad** | 1/host | 100s/host | 10s/host |
| **Portabilidad** | Binario + deps | Imagen OCI (self-contained) | Disco VM completo |
| **Inmutabilidad** | No | Sí (imagen inmutable) | Snapshots |
| **Seguridad** | Proceso usuario | Capabilities, seccomp, AppArmor | Fuerte (hardware) |

### Namespaces (aislamiento de visibilidad)

| Namespace | Aísla | Comando ver |
|-----------|-------|-------------|
| `pid` | PIDs (PID 1 en contenedor) | `lsns -t pid` |
| `net` | Interfaces, routing, firewall | `ip netns` |
| `mnt` | Puntos de montaje | `findmnt` |
| `uts` | Hostname, domainname | `hostname` |
| `ipc` | Memoria compartida, semáforos | `ipcs` |
| `user` | UIDs/GIDs (mapeo root→no-root) | `id` |
| `cgroup` | Jerarquía cgroups | `cat /proc/self/cgroup` |

### Cgroups (control de recursos)

- **v1**: `/sys/fs/cgroup/<controller>/`
- **v2**: `/sys/fs/cgroup/` (unificada)
- Límites: `memory.max`, `cpu.max`, `pids.max`, `io.max`

```bash
# Ver cgroups de un contenedor
docker run -d --name test --memory=512m --cpus=1 alpine sleep 3600
cat /sys/fs/cgroup/docker/<container-id>/memory.max
cat /sys/fs/cgroup/docker/<container-id>/cpu.max
```

---

## Demo en vivo: anatomía de `docker run`

```bash
# 1. Pull implícito + run
docker run --rm -it alpine:3.20 sh

# 2. Detached con nombre, puerto, variables, volumen
docker run -d \
  --name mi-web \
  -p 8080:80 \
  -e ENV=production \
  -v $(pwd)/html:/usr/share/nginx/html:ro \
  nginx:alpine

# 3. Inspeccionar
docker inspect mi-web | jq '.[0].NetworkSettings.Ports'
docker inspect mi-web | jq '.[0].Mounts'
docker inspect mi-web | jq '.[0].Config.Env'

# 4. Logs y exec
docker logs -f mi-web
docker exec -it mi-web sh

# 5. Stats (recursos)
docker stats mi-web --no-stream

# 6. Limpieza
docker rm -f mi-web
```

---

## Autoevaluación escrita (5 min, individual)

**Responde en tu cuaderno / editor:**

1. ¿Qué comando crea una capa nueva en una imagen?
2. ¿Por qué `docker run -it` necesita `-t` (tty) para shell interactivo?
3. ¿Qué hace `--rm` en `docker run`?
4. Diferencia entre `COPY` y `ADD` en Dockerfile.
5. ¿Cómo ves las capas de una imagen sin hacer pull?

---

## Recursos post-sesión

- [Docker Overview](https://docs.docker.com/get-started/overview/)
- [Containerd architecture](https://containerd.io/architecture/)
- [runc spec](https://github.com/opencontainers/runtime-spec)
- [Linux namespaces](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [Cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

---

## Preparación para siguiente sesión (1.2)

- Repasar: `FROM`, `RUN`, `COPY`, `WORKDIR`, `CMD`, `ENTRYPOINT`.
- Leer: [Dockerfile reference](https://docs.docker.com/reference/dockerfile/).
- Traer dudas sobre `.dockerignore` y cache de capas.