# Instalación de Docker en Ubuntu 24.04

## Requisitos previos

- Ubuntu 24.04 LTS (Noble Numbat) instalado
- Usuario con privilegios `sudo`
- Conexión a Internet
- Mínimo 4 GB RAM, 2 vCPU recomendados

## Verificar versión de Ubuntu

```bash
lsb_release -a
# Debería mostrar: Ubuntu 24.04 LTS (Noble Numbat)
```

## Método 1: Instalación oficial Docker Engine (Recomendado)

### 1. Actualizar paquetes e instalar dependencias

```bash
sudo apt-get update && sudo apt-get upgrade -y

sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release
```

### 2. Añadir clave GPG oficial de Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

### 3. Añadir repositorio oficial

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 4. Instalar Docker Engine, CLI, Compose y Buildx

```bash
sudo apt-get update

sudo apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
```

### 5. Verificar instalación

```bash
# Versión del motor
docker version --format '{{.Server.Version}}'

# Compose v2 (plugin)
docker compose version

# Buildx
docker buildx version

# Test básico
docker run --rm hello-world
```

## Método 2: Script de conveniencia (Alternativo)

```bash
# Instalación rápida con script oficial
curl -fsSL https://get.docker.com | sh

# Añadir usuario al grupo docker
sudo usermod -aG docker $USER
newgrp docker
```

## Configuración post-instalación

### 1. Añadir usuario al grupo docker (evitar sudo)

```bash
sudo usermod -aG docker $USER

# Aplicar cambios sin reiniciar sesión
newgrp docker

# Verificar
docker run --rm hello-world
```

### 2. Configurar Docker para iniciar al arranque

```bash
sudo systemctl enable docker.service
sudo systemctl enable containerd.service

# Verificar estado
sudo systemctl status docker
```

### 3. Configurar daemon.json (Opcional - Recomendado para producción)

```bash
sudo mkdir -p /etc/docker

sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  },
  "live-restore": true,
  "userland-proxy": false,
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "features": {
    "buildkit": true
  }
}
EOF

sudo systemctl restart docker
```

### 4. Verificar configuración

```bash
docker info --format '{{.LoggingDriver}}'
docker info --format '{{.StorageDriver}}'
docker info --format '{{.CgroupDriver}}'
```

## Instalar herramientas adicionales recomendadas

### 1. Dive (Análisis de capas)

```bash
# Descargar última versión
DIVE_VERSION=$(curl -s https://api.github.com/repos/wagoodman/dive/releases/latest | grep tag_name | cut -d '"' -f 4)
wget https://github.com/wagoodman/dive/releases/download/${DIVE_VERSION}/dive_${DIVE_VERSION#v}_linux_amd64.deb
sudo apt-get install -y ./dive_${DIVE_VERSION#v}_linux_amd64.deb
rm dive_${DIVE_VERSION#v}_linux_amd64.deb

# Verificar
dive --version
```

### 2. Hadolint (Lint Dockerfile)

```bash
# Descargar binario
HADOLINT_VERSION=$(curl -s https://api.github.com/repos/hadolint/hadolint/releases/latest | grep tag_name | cut -d '"' -f 4)
wget https://github.com/hadolint/hadolint/releases/download/${HADOLINT_VERSION}/hadolint-Linux-x86_64
sudo mv hadolint-Linux-x86_64 /usr/local/bin/hadolint
sudo chmod +x /usr/local/bin/hadolint

# Verificar
hadolint --version
```

### 3. Trivy (Escaneo vulnerabilidades)

```bash
# Añadir repositorio
sudo apt-get install -y wget apt-transport-https gnupg lsb-release
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
sudo apt-get update
sudo apt-get install -y trivy

# Verificar
trivy --version
```

### 4. Cosign (Firma imágenes)

```bash
COSIGN_VERSION=$(curl -s https://api.github.com/repos/sigstore/cosign/releases/latest | grep tag_name | cut -d '"' -f 4)
wget https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64
sudo mv cosign-linux-amd64 /usr/local/bin/cosign
sudo chmod +x /usr/local/bin/cosign

# Verificar
cosign version
```

### 5. Syft + Grype (SBOM + Scan)

```bash
# Syft
SYFT_VERSION=$(curl -s https://api.github.com/repos/anchore/syft/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sudo sh -s -- -b /usr/local/bin ${SYFT_VERSION}

# Grype
GRYPE_VERSION=$(curl -s https://api.github.com/repos/anchore/grype/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sudo sh -s -- -b /usr/local/bin ${GRYPE_VERSION}

# Verificar
syft --version
grype --version
```

### 6. Kind (Kubernetes local)

```bash
# Kind
KIND_VERSION=$(curl -s https://api.github.com/repos/kubernetes-sigs/kind/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -Lo ./kind https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64
sudo mv ./kind /usr/local/bin/kind
sudo chmod +x /usr/local/bin/kind

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo mv ./kubectl /usr/local/bin/kubectl
sudo chmod +x /usr/local/bin/kubectl

# Verificar
kind version
kubectl version --client
```

### 7. Helm (Gestor paquetes K8s)

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verificar
helm version
```

### 8. k9s (UI terminal K8s)

```bash
K9S_VERSION=$(curl -s https://api.github.com/repos/derailed/k9s/releases/latest | grep tag_name | cut -d '"' -f 4)
wget https://github.com/derailed/k9s/releases/download/${K9S_VERSION}/k9s_Linux_amd64.tar.gz
tar -xzf k9s_Linux_amd64.tar.gz
sudo mv k9s /usr/local/bin/
rm k9s_Linux_amd64.tar.gz

# Verificar
k9s version
```

## Script de instalación completa (Todo en uno)

```bash
#!/bin/bash
# install-docker-ubuntu24.sh
# Ejecutar: chmod +x install-docker-ubuntu24.sh && ./install-docker-ubuntu24.sh

set -euo pipefail

echo "=== Instalando Docker Engine en Ubuntu 24.04 ==="

# 1. Actualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# 2. Dependencias
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 3. Clave GPG Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 4. Repositorio
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. Instalar Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 6. Usuario al grupo docker
sudo usermod -aG docker $USER

# 7. Configurar daemon
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "storage-driver": "overlay2",
  "live-restore": true,
  "features": { "buildkit": true }
}
EOF

sudo systemctl restart docker
sudo systemctl enable docker

# 7. Herramientas adicionales
echo "Instalando herramientas adicionales..."

# Dive
DIVE_VERSION=$(curl -s https://api.github.com/repos/wagoodman/dive/releases/latest | grep tag_name | cut -d '"' -f 4)
wget -q https://github.com/wagoodman/dive/releases/download/${DIVE_VERSION}/dive_${DIVE_VERSION#v}_linux_amd64.deb
sudo apt-get install -y ./dive_${DIVE_VERSION#v}_linux_amd64.deb
rm dive_${DIVE_VERSION#v}_linux_amd64.deb

# Hadolint
HADOLINT_VERSION=$(curl -s https://api.github.com/repos/hadolint/hadolint/releases/latest | grep tag_name | cut -d '"' -f 4)
wget -q https://github.com/hadolint/hadolint/releases/download/${HADOLINT_VERSION}/hadolint-Linux-x86_64
sudo mv hadolint-Linux-x86_64 /usr/local/bin/hadolint
sudo chmod +x /usr/local/bin/hadolint

# Trivy
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/trivy.list
sudo apt-get update && sudo apt-get install -y trivy

# Cosign
COSIGN_VERSION=$(curl -s https://api.github.com/repos/sigstore/cosign/releases/latest | grep tag_name | cut -d '"' -f 4)
wget -q https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64
sudo mv cosign-linux-amd64 /usr/local/bin/cosign
sudo chmod +x /usr/local/bin/cosign

# Syft + Grype
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sudo sh -s -- -b /usr/local/bin
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sudo sh -s -- -b /usr/local/bin

# Kind + kubectl
KIND_VERSION=$(curl -s https://api.github.com/repos/kubernetes-sigs/kind/releases/latest | grep tag_name | cut -d '"' -f 4)
curl -Lo ./kind https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64
sudo mv ./kind /usr/local/bin/kind
sudo chmod +x /usr/local/bin/kind

curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo mv ./kubectl /usr/local/bin/kubectl
sudo chmod +x /usr/local/bin/kubectl

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# k9s
K9S_VERSION=$(curl -s https://api.github.com/repos/derailed/k9s/releases/latest | grep tag_name | cut -d '"' -f 4)
wget -q https://github.com/derailed/k9s/releases/download/${K9S_VERSION}/k9s_Linux_amd64.tar.gz
tar -xzf k9s_Linux_amd64.tar.gz
sudo mv k9s /usr/local/bin/
rm k9s_Linux_amd64.tar.gz

# 8. Verificación final
echo "=== Verificación final ==="
docker version --format 'Server: {{.Server.Version}}'
docker compose version
docker buildx version
docker run --rm hello-world

echo "=== Instalación completada ==="
echo "IMPORTANTE: Cierra sesión y vuelve a entrar (o ejecuta 'newgrp docker')"
```

## Verificación completa post-instalación

```bash
#!/bin/bash
# verify-install.sh

echo "=== Verificación completa Docker ==="

echo "1. Docker Engine:"
docker version --format '{{.Server.Version}}'

echo "2. Docker Compose v2:"
docker compose version

echo "3. Buildx:"
docker buildx version

echo "4. Hello World:"
docker run --rm hello-world

echo "5. Buildx multi-arch:"
docker buildx create --name test-builder --driver docker-container --use 2>/dev/null || true
docker buildx build --platform linux/amd64,linux/arm64 -t test-multiarch --load . 2>&1 | tail -5

echo "6. Herramientas:"
echo "  dive: $(dive --version 2>&1 | head -1)"
echo "  hadolint: $(hadolint --version 2>&1 | head -1)"
echo "  trivy: $(trivy --version 2>&1 | head -1)"
echo "  cosign: $(cosign version 2>&1 | head -1)"
echo "  syft: $(syft --version 2>&1 | head -1)"
echo "  grype: $(grype --version 2>&1 | head -1)"
echo "  kind: $(kind version)"
echo "  kubectl: $(kubectl version --client --output=yaml | grep gitVersion)"
echo "  helm: $(helm version --short)"
echo "  k9s: $(k9s version 2>&1 | head -1)"

echo "=== Verificación completada ==="
```

## Solución de problemas comunes

| Problema | Solución |
|----------|----------|
| `docker: permission denied` | `sudo usermod -aG docker $USER && newgrp docker` |
| `no space left on device` | `docker system prune -a --volumes` |
| `Cannot connect to the Docker daemon` | `sudo systemctl start docker` |
| `docker buildx` no funciona | `docker buildx create --use --driver docker-container` |
| Puerto 80/443 ocupado | `sudo lsof -i :80` → matar proceso o cambiar puerto |
| `x509: certificate signed by unknown authority` | Añadir registry a `/etc/docker/daemon.json` → `insecure-registries` |

## Desinstalar Docker (si necesario)

```bash
# Parar servicios
sudo systemctl stop docker
sudo systemctl stop containerd

# Eliminar paquetes
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras

# Eliminar datos (¡CUIDADO: borra todo!)
sudo rm -rf /var/lib/docker
sudo rm -rf /var/lib/containerd
sudo rm -rf /etc/docker
sudo rm -rf /etc/apt/sources.list.d/docker.list
sudo rm -rf /etc/apt/keyrings/docker.gpg

# Eliminar grupo docker
sudo groupdel docker
```

## Referencias

- [Documentación oficial Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose v2](https://docs.docker.com/compose/install/linux/)
- [Buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [Daemon configuration](https://docs.docker.com/config/daemon/)
- [Post-installation steps](https://docs.docker.com/engine/install/linux-postinstall/)