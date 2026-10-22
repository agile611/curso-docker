# Día 3 - 01: Introducción y diagnóstico (Seguridad)

## Objetivos de la sesión

- [ ] Entender el modelo de amenazas en contenedores.
- [ ] Identificar vectores de ataque: escape, supply chain, misconfiguración.
- [ ] Aplicar principio de menor privilegio: non-root, read-only, capabilities.
- [ ] Configurar seccomp, AppArmor, gVisor/Kata.
- [ ] Autoevaluación de postura de seguridad actual.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap día 2 + preguntas seguridad |
| 30 min | Threat modeling: STRIDE para contenedores |
| 20 min | Demo: escape de contenedor (CVE-2019-5736 runc) |
| 10 min | Break |
| 40 min | Laboratorio guiado: hardening progresivo |
| 20 min | Laboratorio autónomo: benchmark CIS Docker |
| 10 min | Preguntas + checkpoint |

---

## Threat Modeling: STRIDE para contenedores

| Categoría | Vector en contenedores | Mitigación |
|-----------|------------------------|------------|
| **Spoofing** | Imagen falsa en registry, typosquatting | Firma cosign, pin por digest, SBOM |
| **Tampering** | Modificar imagen en tránsito, build compromise | Build reproducible, provenance SLSA, firma |
| **Repudiation** | No auditoría de acciones en contenedor | Logging centralizado, auditd, falco |
| **Information Disclosure** | Secrets en capas, env vars, logs | Build secrets, runtime secrets, no secrets en imagen |
| **Denial of Service** | Fork bomb, resource exhaustion, OOM | cgroups limits, pids limit, read-only |
| **Elevation of Privilege** | Container escape (runc, kernel), --privileged | Non-root, cap_drop, seccomp, gVisor/Kata |

### Superficie de ataque típica

```
┌─────────────────────────────────────────────────────────────┐
│                    HOST KERNEL                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Container A │  │ Container B │  │ Container C │         │
│  │  (app)      │  │  (db)       │  │  (attacker) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│              ┌─────────────────────┐                        │
│              │   Docker Daemon     │  (root en host)        │
│              │   (socket /var/     │                        │
│              │    run/docker.sock) │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

**Puntos críticos:**
1. **Docker socket** (`/var/run/docker.sock`) = root en host si montado.
2. **Kernel compartido** = exploit kernel = escape todos contenedores.
3. **Imágenes** = supply chain (base images, dependencies, build process).
4. **Runtime config** = --privileged, --cap-add, host network, host pid.

---

## CIS Docker Benchmark: controles clave

| Control | Descripción | Verificación |
|---------|-------------|--------------|
| **4.1** | Usuario no-root | `docker inspect --format '{{.Config.User}}' imagen` |
| **4.2** | Read-only rootfs | `docker inspect --format '{{.HostConfig.ReadonlyRootfs}}'` |
| **4.3** | Capabilities mínimas | `docker inspect --format '{{.HostConfig.CapDrop}}'` |
| **4.4** | No --privileged | `docker inspect --format '{{.HostConfig.Privileged}}'` |
| **4.5** | No host network | `docker inspect --format '{{.HostConfig.NetworkMode}}'` |
| **4.6** | No host pid | `docker inspect --format '{{.HostConfig.PidMode}}'` |
| **4.7** | No host ipc | `docker inspect --format '{{.HostConfig.IpcMode}}'` |
| **4.8** | Seccomp profile | `docker inspect --format '{{.HostConfig.SecurityOpt}}'` |
| **4.9** | AppArmor profile | `docker inspect --format '{{.HostConfig.SecurityOpt}}'` |
| **4.10** | No docker socket mount | `docker inspect --format '{{.Mounts}}' | grep docker.sock` |

### Ejecutar benchmark automático

```bash
# Docker Bench Security (script oficial)
docker run --rm --net host --pid host --userns host --cap-add audit_control \
  -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
  -v /etc:/etc:ro -v /usr/bin/docker-containerd:/usr/bin/docker-containerd:ro \
  -v /usr/bin/docker-runc:/usr/bin/docker-runc:ro \
  -v /var/lib:/var/lib:ro -v /var/run/docker.sock:/var/run/docker.sock:ro \
  docker/docker-bench-security

# O con kube-bench para K8s
docker run --rm -v /etc:/etc:ro -v /var:/var:ro -v /usr/bin:/usr/bin:ro \
  aquasec/kube-bench:latest
```

---

## Escape de contenedor: CVE-2019-5736 (runc)

### Vulnerabilidad

- runc < 1.0-rc6 permite sobrescribir binario runc en host via `/proc/self/exe`.
- Contenedor malicioso con `--pid=host` o acceso a `/proc` puede hacer escape.

### Demo (solo educativa, entorno controlado)

```bash
# NO EJECUTAR EN PRODUCCIÓN
# Entorno: runc vulnerable + contenedor con --pid=host

# 1. Ver versión runc
runc --version

# 2. Si vulnerable (< 1.0-rc6), contenedor puede:
#    - Acceder a /proc/self/exe (binario runc en host)
#    - Sobrescribirlo con payload
#    - Próximo docker run ejecuta payload como root en host

# Mitigación:
# - Actualizar runc / Docker Engine
# - No usar --pid=host
# - Seccomp bloquea ptrace, process_vm_writev
# - gVisor/Kata aíslan kernel
```

---

## Laboratorio guiado: Hardening progresivo

### Nivel 0: Baseline (imagen original)

```bash
# Build imagen sin hardening
cat > Dockerfile.baseline <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/server.js"]
EOF

docker build -t api:baseline -f Dockerfile.baseline ./apps/api

# Verificar
docker run --rm api:baseline id
# uid=0(root) gid=0(root)
```

### Nivel 1: Non-root user

```dockerfile
# Dockerfile.nonroot
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Non-root
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
USER appuser

CMD ["node", "dist/server.js"]
```

```bash
docker build -t api:nonroot -f Dockerfile.nonroot ./apps/api
docker run --rm api:nonroot id
# uid=1001(appuser) gid=1001(appgroup)
```

### Nivel 2: Read-only + tmpfs

```dockerfile
# Dockerfile.readonly
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser

# Preparar dirs writables
USER root
RUN mkdir -p /tmp/app /var/run/app && chown -R appuser:appgroup /tmp/app /var/run/app
USER appuser

CMD ["node", "dist/server.js"]
```

```bash
docker build -t api:readonly -f Dockerfile.readonly ./apps/api

# Test read-only
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=50m --tmpfs /var/run:rw,size=10m api:readonly touch /tmp/test  # OK
docker run --rm --read-only api:readonly touch /test  # Error
```

### Nivel 3: Capabilities drop

```bash
# Sin capabilities (runtime)
docker run --rm --cap-drop=ALL api:readonly sh -c 'capsh --print'
# Current: = (ninguna)
```

### Nivel 4: Seccomp personalizado

```json
// seccomp-profile.json
{
  "defaultAction": "SCMP_ACT_ALLOW",
  "syscalls": [
    {"names": ["mount", "umount2", "pivot_root", "reboot", "kexec_load", "bpf", "keyctl"], "action": "SCMP_ACT_ERRNO"}
  ]
}
```

```bash
docker run --rm --security-opt seccomp=seccomp-profile.json api:readonly sh -c 'mount'  # Error: Operation not permitted
```

### Nivel 5: gVisor (runtime alternativo)

```bash
# Instalar gVisor
curl -fsSL https://gvisor.dev/archive.key | sudo gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" | sudo tee /etc/apt/sources.list.d/gvisor.list
sudo apt update && sudo apt install runsc
runsc install
sudo systemctl restart docker

# Usar
docker run --rm --runtime=runsc api:readonly uname -a
# Kernel: gVisor (no Linux host)
```

---

## Laboratorio autónomo: CIS Benchmark

### Tareas

1. Ejecutar `docker-bench-security` en imagen baseline vs hardened.
2. Comparar resultados: ¿cuántos checks pasan/fallan?
3. Aplicar fixes restantes para alcanzar 100% (o documentar excepciones).
4. Crear checklist de hardening para el equipo.

### Script de verificación

```bash
#!/usr/bin/env bash
# check-hardening.sh
IMAGE=$1

echo "=== Hardening Check para $IMAGE ==="

USER=$(docker image inspect $IMAGE --format '{{.Config.User}}')
echo "User: $USER"
[[ "$USER" != "" && "$USER" != "root" && "$USER" != "0" ]] && echo "✅ Non-root" || echo "❌ Root"

# Runtime checks (requiere run)
CID=$(docker run -d --read-only --cap-drop=ALL --security-opt seccomp=seccomp-profile.json $IMAGE sleep 30)
sleep 2

READONLY=$(docker inspect $CID --format '{{.HostConfig.ReadonlyRootfs}}')
echo "ReadOnly: $READONLY"
[[ "$READONLY" == "true" ]] && echo "✅ Read-only" || echo "❌ Not read-only"

CAPDROP=$(docker inspect $CID --format '{{.HostConfig.CapDrop}}')
echo "CapDrop: $CAPDROP"
[[ "$CAPDROP" == "[ALL]" ]] && echo "✅ Cap drop ALL" || echo "❌ Cap drop incomplete"

SECCOMP=$(docker inspect $CID --format '{{.HostConfig.SecurityOpt}}')
echo "SecurityOpt: $SECCOMP"
echo "$SECCOMP" | grep -q seccomp && echo "✅ Seccomp" || echo "❌ No seccomp"

docker rm -f $CID >/dev/null
```

---

## Checkpoint validación

```bash
# validate.sh lab-3-1
#!/usr/bin/env bash
set -euo pipefail

echo "1. Imagen baseline vs hardened..."
docker image inspect api:baseline --format '{{.Config.User}}' | grep -q '^$' || exit 1
docker image inspect api:nonroot --format '{{.Config.User}}' | grep -q '1001' || exit 1

echo "2. Read-only funciona..."
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=10m api:readonly touch /tmp/ok
! docker run --rm --read-only api:readonly touch /fail 2>/dev/null || exit 1

echo "3. Capabilities dropped..."
docker run --rm --cap-drop=ALL api:readonly sh -c 'capsh --print' | grep -q 'Current: ='

echo "4. Seccomp bloquea syscalls peligrosas..."
docker run --rm --security-opt seccomp=seccomp-profile.json api:readonly mount 2>&1 | grep -q 'Operation not permitted'

echo "✅ Checkpoint 3.1 superado"
```

---

## Recursos post-sesión

- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [Docker Bench Security](https://github.com/docker/docker-bench-security)
- [Container escape CVEs](https://github.com/containerd/containerd/blob/main/docs/SECURITY.md)
- [gVisor](https://gvisor.dev/)
- [Kata Containers](https://katacontainers.io/)
- [Seccomp reference](https://man7.org/linux/man-pages/man2/seccomp.2.html)