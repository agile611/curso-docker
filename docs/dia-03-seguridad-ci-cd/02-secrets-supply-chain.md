# Día 3 - 02: Descomposición y verificación (Secrets y Supply Chain)

## Objetivos de la sesión

- [ ] Diferenciar build secrets vs runtime secrets.
- [ ] Implementar BuildKit secrets para tokens de build (npm, pip, ssh).
- [ ] Configurar runtime secrets en Compose, Swarm, Kubernetes.
- [ ] Usar SOPS para encriptar secrets en Git.
- [ ] Entender supply chain security: SLSA, provenance, cosign.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap hardening + preguntas secrets |
| 30 min | Teoría: tipos de secrets, ciclo de vida, threat model |
| 20 min | Demo: BuildKit secret, runtime secret, SOPS |
| 10 min | Break |
| 50 min | Laboratorio guiado: secrets en pipeline completo |
| 20 min | Laboratorio autónomo: rotación de secrets, Vault intro |
| 10 min | Preguntas + checkpoint |

---

## Tipos de secrets: clasificación

| Tipo | Ciclo de vida | Ejemplos | Herramientas |
|------|---------------|----------|--------------|
| **Build secret** | Solo durante `docker build` | npm token, pip index URL, SSH key para git privado, Maven settings | BuildKit `--mount=type=secret`, `--mount=type=ssh` |
| **Runtime secret** | Durante ejecución del contenedor | DB password, JWT secret, API keys, TLS certs | Docker secrets (Swarm), K8s secrets, Vault, SOPS |
| **Config (no secreto)** | Build + runtime | Config files, feature flags, URLs no sensibles | Docker configs, K8s ConfigMaps |

### Principio: nunca en imagen, nunca en env vars (si es posible)

```dockerfile
# ❌ MALO: Secret en capa de imagen
ARG DB_PASSWORD
ENV DB_PASSWORD=$DB_PASSWORD

# ❌ MALO: Secret en env var (visible en `docker inspect`, logs, /proc)
ENV JWT_SECRET=super-secret

# ✅ BUENO: Build secret (no persiste)
RUN --mount=type=secret,id=db_password \
    echo "password=$(cat /run/secrets/db_password)" > /tmp/config

# ✅ BUENO: Runtime secret (archivo en /run/secrets/)
# En contenedor: cat /run/secrets/jwt_secret
```

---

## BuildKit Secrets: implementación

### Sintaxis

```dockerfile
# syntax=docker/dockerfile:1.7

# Secret genérico (archivo)
RUN --mount=type=secret,id=my_secret \
    cat /run/secrets/my_secret

# Secret con target personalizado
RUN --mount=type=secret,id=npm_token,target=/run/secrets/npmrc \
    cat /run/secrets/npmrc

# Secret con modo (permisos)
RUN --mount=type=secret,id=ssh_key,mode=0400 \
    cat /run/secrets/ssh_key

# SSH agent forwarding (para git clone privado)
RUN --mount=type=ssh,id=github \
    git clone git@github.com:org/private-repo.git
```

### Casos de uso comunes

#### npm / yarn token

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./

# Build secret para npm
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)" \
    && npm ci --only=production

COPY . .
RUN npm run build
```

```bash
# Build
echo "npm_xxxxxxxxxxxxx" > /tmp/npm_token
docker build --secret id=npm_token,src=/tmp/npm_token -t mi-app .
```

#### pip index URL + credenciales

```dockerfile
FROM python:3.12-alpine AS builder
WORKDIR /app

COPY pyproject.toml ./

RUN --mount=type=secret,id=pypi_config \
    pip config set global.index-url "$(cat /run/secrets/pypi_config)" \
    && pip install --no-cache-dir --prefix=/install .

COPY src/ ./src/
RUN pip install --no-cache-dir --prefix=/install .
```

#### SSH key para git privado

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /src

# SSH agent forwarding
RUN --mount=type=ssh,id=github \
    git clone git@github.com:org/private-module.git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /app/server .
```

```bash
# Build con SSH key
docker build --ssh github=$HOME/.ssh/id_ed25519 -t mi-app .
```

---

## Runtime Secrets: Compose, Swarm, K8s

### Docker Compose (Swarm mode)

```yaml
# docker-compose.yml
secrets:
  db_password:
    external: true  # Creado con `docker secret create`
  jwt_secret:
    file: ./secrets/jwt_secret.txt  # Solo dev

services:
  api:
    secrets:
      - source: db_password
        target: /run/secrets/db_password
        mode: 0400
        uid: '1001'
        gid: '1001'
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password
```

```bash
# Crear secrets en Swarm
echo "super-db-password" | docker secret create db_password -
echo "super-jwt-secret" | docker secret create jwt_secret -

# Ver
docker secret ls
docker secret inspect db_password
```

### Kubernetes Secrets

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: production
type: Opaque
stringData:
  db_password: "super-db-password"
  jwt_secret: "super-jwt-secret"
---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          env:
            - name: DB_PASSWORD_FILE
              value: "/run/secrets/db_password"
          volumeMounts:
            - name: secrets
              mountPath: /run/secrets
              readOnly: true
      volumes:
        - name: secrets
          secret:
            secretName: app-secrets
            defaultMode: 0400
```

```bash
# Crear desde CLI
kubectl create secret generic app-secrets \
  --from-literal=db_password=super-db-password \
  --from-literal=jwt_secret=super-jwt-secret \
  -n production

# O desde archivo
kubectl create secret generic app-secrets \
  --from-file=./secrets/ \
  -n production
```

### Leer secrets en aplicación

```javascript
// Node.js
const fs = require('fs');

function readSecret(name) {
  try {
    return fs.readFileSync(`/run/secrets/${name}`, 'utf8').trim();
  } catch {
    return process.env[`${name.toUpperCase()}_FILE`] 
      ? fs.readFileSync(process.env[`${name.toUpperCase()}_FILE`], 'utf8').trim()
      : process.env[name.toUpperCase()];
  }
}

const dbPassword = readSecret('db_password');
const jwtSecret = readSecret('jwt_secret');
```

```python
# Python
import os

def read_secret(name):
    path = f"/run/secrets/{name}"
    if os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    env_var = f"{name.upper()}_FILE"
    if env_var in os.environ:
        with open(os.environ[env_var]) as f:
            return f.read().strip()
    return os.environ.get(name.upper())

db_password = read_secret('db_password')
jwt_secret = read_secret('jwt_secret')
```

---

## SOPS: Secrets OPerationS

### Instalación y setup

```bash
# Instalar
brew install sops age

# Generar clave age (guardar age.key de forma segura!)
age-keygen -o age.key
# Public key: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Exportar para CI/CD
export SOPS_AGE_KEY_FILE=age.key
# O en GitHub Actions: SOPS_AGE_KEY como secret
```

### Encriptar archivo

```yaml
# secrets.yaml (plaintext - NO commitear)
db_password: "super-db-password"
jwt_secret: "super-jwt-secret"
api_key: "sk-xxxxxxxxxxxxx"
```

```bash
# Encriptar
sops --encrypt --age age1... secrets.yaml > secrets.enc.yaml

# Resultado: secrets.enc.yaml (seguro para commitear)
```

```yaml
# secrets.enc.yaml
db_password: ENC[AES256_GCM,data:K2...,iv:...,tag:...]
jwt_secret: ENC[AES256_GCM,data:L3...,iv:...,tag:...]
api_key: ENC[AES256_GCM,data:M4...,iv:...,tag:...]
sops:
  kms: []
  gcp_kms: []
  azure_kv: []
  hc_vault: []
  age:
    - recipient: age1...
      enc: |
        -----BEGIN AGE ENCRYPTED FILE-----
        ...
  lastmodified: "2024-01-15T10:00:00Z"
  mac: ENC[AES256_GCM,data:...,iv:...,tag:...]
  pgp: []
  unencrypted_suffix: _unencrypted
  version: 3.8.1
```

### Desencriptar en CI/CD

```yaml
# .github/workflows/ci.yml
- name: Decrypt secrets
  run: |
    sops --decrypt --age $SOPS_AGE_KEY secrets.enc.yaml > secrets.yaml
  env:
    SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
```

### Editar archivo encriptado

```bash
# Abre editor, desencripta, edita, encripta al guardar
sops secrets.enc.yaml

# O con editor específico
EDITOR=vim sops secrets.enc.yaml
```

### .sops.yaml (configuración por repo)

```yaml
# .sops.yaml
creation_rules:
  - path_regex: secrets/.*\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - path_regex: config/.*\.enc\.yaml$
    age: age1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

---

## Supply Chain Security: SLSA, Provenance, Cosign

### Niveles SLSA (Supply Chain Levels for Software Artifacts)

| Nivel | Requisitos | Protección contra |
|-------|------------|-------------------|
| **SLSA 1** | Build scripted, provenance generada | Tampering básico |
| **SLSA 2** | Build service (hosted), provenance firmada | Compromiso build local |
| **SLSA 3** | Build service hardened, non-falsifiable provenance | Compromiso build service |
| **SLSA 4** | Reproducible builds, two-person review, hermetic | Insider threat, supply chain avanzado |

### Provenance (attestation de build)

```json
// provenance.json (generado por slsa-github-generator)
{
  "_type": "https://in-toto.io/Statement/v0.1",
  "predicateType": "https://slsa.dev/provenance/v1",
  "subject": [
    {"name": "ghcr.io/owner/api", "digest": {"sha256": "abc123..."}}
  ],
  "predicate": {
    "builder": {"id": "https://github.com/Action/Builder"},
    "buildType": "https://github.com/Action/Builder",
    "invocation": {
      "configSource": {"uri": "github.com/owner/repo", "digest": {"sha1": "..."}},
      "parameters": {"workflow": "ci.yml", "ref": "main"}
    },
    "metadata": {"buildInvocationId": "github.com/owner/repo/actions/runs/123"},
    "materials": [
      {"uri": "github.com/owner/repo", "digest": {"sha1": "..."}}
    ]
  }
}
```

### Firmar y verificar con cosign

```bash
# Firmar imagen (keyless - usa OIDC token de GitHub Actions)
cosign sign --yes ghcr.io/owner/api@sha256:abc123...

# Verificar firma
cosign verify ghcr.io/owner/api@sha256:abc123... \
  --certificate-identity-regexp "https://github.com/owner/repo" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"

# Firmar attestation (provenance)
cosign attest --predicate-type=slsaprovenance \
  --predicate=provenance.json \
  ghcr.io/owner/api@sha256:abc123...

# Verificar attestation
cosign verify-attestation --type=slsaprovenance \
  ghcr.io/owner/api@sha256:abc123...
```

### Policy enforcement (admission control)

```yaml
# Kyverno: requerir imagen firmada por cosign
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-cosign-signature
spec:
  validationFailureAction: Enforce
  rules:
    - name: verify-cosign
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - image: "ghcr.io/owner/*"
          key: |-
            -----BEGIN PUBLIC KEY-----
            MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
            -----END PUBLIC KEY-----
```

---

## Laboratorio guiado: Secrets en pipeline completo

### 1. Build secret en Dockerfile.api

```dockerfile
# apps/api/Dockerfile (añadir a builder stage)
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder
WORKDIR /app

# Build secret para npm token privado
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken="$(cat /run/secrets/npm_token)"

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

COPY . .
RUN npm run build
RUN npm test
```

### 2. Runtime secrets en docker-compose.yml

```yaml
# docker-compose.yml (actualizar)
secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt

services:
  api:
    secrets:
      - source: db_password
        target: /run/secrets/db_password
        mode: 0400
      - source: jwt_secret
        target: /run/secrets/jwt_secret
        mode: 0400
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
```

### 3. SOPS para secrets en repo

```bash
# 1. Generar clave age
age-keygen -o age.key
# Guardar age.key en 1Password / Bitwarden / Vault

# 2. Crear secrets.yaml
cat > secrets.yaml <<'EOF'
db_password: "prod-db-password"
jwt_secret: "prod-jwt-secret-256-bit"
EOF

# 3. Encriptar
sops --encrypt --age age1... secrets.yaml > secrets.enc.yaml

# 4. Commitear secrets.enc.yaml (NO secrets.yaml ni age.key)
git add secrets.enc.yaml
git commit -m "chore: add encrypted secrets"
```

### 4. Pipeline CI con secrets

```yaml
# .github/workflows/ci.yml (extracto)
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      
      - name: Decrypt secrets
        run: sops --decrypt --age $SOPS_AGE_KEY secrets.enc.yaml > secrets.yaml
        env:
          SOPS_AGE_KEY: ${{ secrets.SOPS_AGE_KEY }}
      
      - name: Build with build secret
        uses: docker/build-push-action@v5
        with:
          context: ./apps/api
          secret-files: |
            npm_token=secrets/npm_token.txt
          # ...
```

---

## Laboratorio autónomo: Rotación y Vault

### Tarea 1: Rotación de secrets

```bash
# 1. Generar nuevo secret
openssl rand -base64 32 > new_jwt_secret.txt

# 2. Actualizar en Swarm
docker secret rm jwt_secret
docker secret create jwt_secret new_jwt_secret.txt

# 3. Rolling update de servicios
docker service update --secret-rm jwt_secret --secret-add source=jwt_secret,target=/run/secrets/jwt_secret api

# 4. Verificar
docker service ps api  # Debe mostrar rolling restart
```

### Tarea 2: HashiCorp Vault intro (dev mode)

```bash
# 1. Levantar Vault dev
docker run -d --name vault -p 8200:8200 \
  -e VAULT_DEV_ROOT_TOKEN_ID=root \
  -e VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200 \
  hashicorp/vault:1.15

# 2. Configurar
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=root

# 3. Escribir secret
vault kv put secret/app/db password=super-secret
vault kv put secret/app/jwt secret=super-jwt

# 4. Leer desde app (con vault agent sidecar en K8s)
# Ver: https://developer.hashicorp.com/vault/docs/platform/k8s/injector
```

---

## Checkpoint validación

```bash
# validate.sh lab-3-2
#!/usr/bin/env bash
set -euo pipefail

echo "1. Build secret en Dockerfile.api..."
grep -q 'type=secret' apps/api/Dockerfile || exit 1

echo "2. Runtime secrets en compose..."
docker compose config | grep -A 10 "api:" | grep -q "secrets:"
docker compose config | grep -q "db_password:"
docker compose config | grep -q "jwt_secret:"

echo "3. SOPS encryptado..."
[[ -f secrets.enc.yaml ]] || exit 1
! grep -q "super-db-password" secrets.enc.yaml || exit 1
sops --decrypt --age $SOPS_AGE_KEY secrets.enc.yaml | grep -q "super-db-password"

echo "4. Cosign verify..."
cosign verify ghcr.io/$(git config --get remote.origin.url | sed -E 's/.*[:/]([^/]+)\/.*/\1/')/api:latest \
  --certificate-identity-regexp "https://github.com/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" || echo "⚠️ Verificar en GHCR"

echo "✅ Checkpoint 3.2 superado"
```

---

## Recursos post-sesión

- [BuildKit secrets](https://docs.docker.com/build/building/secrets/)
- [Docker secrets](https://docs.docker.com/engine/swarm/secrets/)
- [Kubernetes secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [SOPS](https://github.com/getsops/sops)
- [SLSA framework](https://slsa.dev/)
- [Cosign](https://docs.sigstore.dev/cosign/)
- [Kyverno policies](https://kyverno.io/policies/)
- [HashiCorp Vault](https://developer.hashicorp.com/vault/docs)