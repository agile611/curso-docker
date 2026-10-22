# Día 4 - 01: Introducción y diagnóstico (Orquestación)

## Objetivos de la sesión

- [ ] Entender la necesidad de orquestación: escalado, alta disponibilidad, rolling updates.
- [ ] Comparar orquestadores: Swarm, Kubernetes, Nomad, ECS.
- [ ] Conocer arquitectura Kubernetes: control plane, worker nodes, componentes.
- [ ] Autoevaluación de conocimientos previos K8s.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap día 3 + preguntas orquestación |
| 30 min | Teoría: por qué orquestación, comparativa orquestadores |
| 20 min | Demo: Swarm init, service create, stack deploy |
| 10 min | Break |
| 40 min | Laboratorio guiado: Swarm deploy completo |
| 20 min | Laboratorio autónomo: kind cluster + kubectl basics |
| 10 min | Preguntas + checkpoint |

---

## Por qué orquestación

### Problemas de `docker run` / `docker compose` en producción

| Problema | Descripción |
|----------|-------------|
| **Escalado manual** | `docker run` x N, gestionar IPs, load balancing |
| **Alta disponibilidad** | Si host muere → contenedores mueren, no hay reschedule |
| **Rolling updates** | Stop/start manual, downtime, no rollback automático |
| **Service discovery** | DNS manual, IPs cambian al recrear |
| **Secrets/Configs** | Volumes/bind mounts, no encriptados, no rotación |
| **Resource scheduling** | No placement constraints, no bin packing |
| **Observabilidad** | Logs dispersos, métricas manuales |

### Orquestador resuelve

```
┌─────────────────────────────────────────────────────────────┐
│                    ORQUESTADOR                              │
├─────────────────────────────────────────────────────────────┤
│  • Scheduling: bin packing, constraints, affinity          │
│  • Service Discovery: DNS interno, load balancing          │
│  • Self-healing: restart, reschedule, health checks        │
│  • Rolling Updates: zero-downtime, rollback, canary        │
│  • Secrets/Configs: encriptados, versionados, rotación     │
│  • Scaling: HPA, VPA, cluster autoscaler                   │
│  • Networking: CNI, NetworkPolicy, Ingress, Service Mesh   │
│  • Storage: CSI, dynamic provisioning, snapshots           │
└─────────────────────────────────────────────────────────────┘
```

---

## Comparativa orquestadores

| Característica | Docker Swarm | Kubernetes | Nomad | ECS/Fargate |
|----------------|--------------|------------|-------|-------------|
| **Complejidad** | Baja | Alta | Media | Media (managed) |
| **Curva aprendizaje** | Suave | Empinada | Suave | Media |
| **HA nativo** | Sí (Raft) | Sí (etcd) | Sí (Raft) | Sí (AWS) |
| **Ecosistema** | Limitado | Masivo | Creciente | AWS-centric |
| **Multi-cloud** | Sí | Sí | Sí | No (AWS only) |
| **Service Mesh** | No nativo | Istio, Linkerd | Consul Connect | App Mesh |
| **Costo** | Gratis (infra) | Gratis (infra) | Gratis (infra) | Pay per use |
| **Mejor para** | Equipos pequeños, Docker-native | Producción enterprise, scale | Híbrido (containers + VMs) | Equipos AWS-only |

### Recomendación por contexto

| Contexto | Orquestador recomendado |
|----------|------------------------|
| **Equipo < 10, solo Docker** | Swarm |
| **Producción enterprise, multi-cloud** | Kubernetes (EKS/GKE/AKS/kind) |
| **Workloads mixtos (containers + VMs + batch)** | Nomad |
| **Todo en AWS, serverless preferido** | ECS/Fargate |
| **Edge / IoT / Air-gapped** | k3s / k0s / Talos |

---

## Arquitectura Kubernetes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTROL PLANE (Master Nodes)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  API Server │  │  Scheduler  │  │Controller   │  │    etcd     │       │
│  │  (frontend) │  │  (pod→node) │  │  Managers   │  │  (state DB) │       │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│         │                │                │                │              │
│         └────────────────┼────────────────┼────────────────┘              │
│                          ▼                ▼                               │
│                   ┌─────────────────────────────┐                        │
│                   │      Cloud Controller       │  (opcional, cloud)     │
│                   └─────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │ Worker Node │   │ Worker Node │   │ Worker Node │
            ├─────────────┤   ├─────────────┤   ├─────────────┤
            │  kubelet    │   │  kubelet    │   │  kubelet    │
            │  kube-proxy │   │  kube-proxy │   │  kube-proxy │
            │  Container  │   │  Container  │   │  Container  │
            │  Runtime    │   │  Runtime    │   │  Runtime    │
            │  (containerd)   │  (containerd)   │  (containerd)   │
            │             │   │             │   │             │
            │  ┌───────┐  │   │  ┌───────┐  │   │  ┌───────┐  │
            │  │ Pod A │  │   │  │ Pod B │  │   │  │ Pod C │  │
            │  └───────┘  │   │  └───────┘  │   │  └───────┘  │
            └─────────────┘   └─────────────┘   └─────────────┘
```

### Componentes clave

| Componente | Función |
|------------|---------|
| **API Server** | Frontend único, REST API, autenticación, autorización, validación |
| **etcd** | Key-value store distribuido, fuente de verdad del cluster |
| **Scheduler** | Asigna pods a nodes (recursos, constraints, affinity) |
| **Controller Manager** | Control loops: Deployment, Service, Node, Job, etc. |
| **Cloud Controller** | Integración cloud provider (LB, routes, volumes) |
| **kubelet** | Agente en cada node, gestiona pods, reporta estado |
| **kube-proxy** | Network proxy, Service IP → Pod IPs (iptables/IPVS) |
| **Container Runtime** | containerd, CRI-O, Docker (via cri-dockerd) |

---

## Swarm vs Kubernetes: mapeo de conceptos

| Docker Swarm | Kubernetes | Notas |
|--------------|------------|-------|
| Service | Deployment + Service | K8s separa despliegue (Deployment) de red (Service) |
| Task | Pod | Pod = 1+ contenedores compartiendo red/volumen |
| Stack | Namespace + recursos | K8s usa namespaces para aislamiento lógico |
| Overlay network | CNI (Calico, Cilium, Flannel) | K8s requiere CNI plugin |
| Secret | Secret | Similar, pero K8s usa etcd (encriptado opcional) |
| Config | ConfigMap | Similar |
| Rolling update | Deployment strategy | K8s: RollingUpdate, Recreate |
| Healthcheck | Liveness/Readiness probes | K8s: 2 tipos, más granular |
| Placement constraints | Node affinity/taints/tolerations | K8s: más expresivo |
| Resource limits | resources.limits/requests | Igual |
| DNS | CoreDNS | Igual |

---

## Laboratorio guiado: Swarm deploy

### 1. Inicializar Swarm

```bash
# En manager
docker swarm init --advertise-addr $(hostname -I | awk '{print $1}')

# Ver token para workers
docker swarm join-token worker

# Ver nodos
docker node ls
```

### 2. Crear red overlay

```bash
docker network create --driver overlay --attachable curso-overlay
```

### 3. Crear secrets

```bash
echo "prod-db-password" | docker secret create db_password -
echo "prod-jwt-secret" | docker secret create jwt_secret -
docker secret ls
```

### 4. Deploy stack

```bash
# Usar compose files del día 2-3
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml curso-swarm

# Ver servicios
docker stack services curso-swarm

# Ver tasks (contenedores reales)
docker stack ps curso-swarm
```

### 5. Operaciones comunes

```bash
# Escalar
docker service scale curso-swarm_api=5

# Actualizar imagen (rolling update)
docker service update --image ghcr.io/owner/api:v1.1.0 curso-swarm_api

# Ver progreso rolling update
docker service ps curso-swarm_api --no-trunc

# Rollback
docker service rollback curso-swarm_api

# Logs agregados
docker service logs -f curso-swarm_api

# Inspeccionar servicio
docker service inspect curso-swarm_api --pretty
```

### 6. Test failover

```bash
# Matar un task
TASK_ID=$(docker service ps curso-swarm_api -q | head -1)
CONTAINER_ID=$(docker inspect -f '{{.Status.ContainerStatus.ContainerID}}' $TASK_ID)
docker kill $CONTAINER_ID

# Verificar reschedule
docker service ps curso-swarm_api
```

---

## Laboratorio autónomo: kind + kubectl basics

### 1. Crear cluster kind

```bash
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
      - containerPort: 443
        hostPort: 443
  - role: worker
  - role: worker

kind create cluster --name curso-k8s --config kind-config.yaml
```

### 2. kubectl basics

```bash
# Ver cluster
kubectl cluster-info
kubectl get nodes -o wide

# Namespaces
kubectl get ns
kubectl create namespace production

# Deploy simple
kubectl create deployment nginx --image=nginx:alpine -n production
kubectl get pods -n production

# Exponer
kubectl expose deployment nginx --port=80 --type=NodePort -n production
kubectl get svc -n production

# Escalar
kubectl scale deployment nginx --replicas=3 -n production

# Rolling update
kubectl set image deployment/nginx nginx=nginx:latest -n production
kubectl rollout status deployment/nginx -n production

# Rollback
kubectl rollout undo deployment/nginx -n production

# Logs
kubectl logs -l app=nginx -n production -f

# Exec
kubectl exec -it <pod> -n production -- sh

# Port forward
kubectl port-forward svc/nginx 8080:80 -n production
```

### 3. Aplicar manifests

```bash
# Desde archivos
kubectl apply -f k8s-manifests/

# Ver recursos creados
kubectl get all -n production
```

---

## Checkpoint validación

```bash
# validate.sh lab-4-1
#!/usr/bin/env bash
set -euo pipefail

echo "1. Swarm inicializado..."
docker node ls | grep -q Leader

echo "2. Red overlay creada..."
docker network ls | grep -q overlay

echo "3. Secrets creados..."
docker secret ls | grep -q db_password
docker secret ls | grep -q jwt_secret

echo "4. Stack deploy..."
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml test-swarm
sleep 15
docker stack services test-swarm | grep -q "1/1"
docker stack rm test-swarm

echo "5. Kind cluster..."
kind create cluster --name test-kind --config .github/kind-config.yaml
kubectl cluster-info --context kind-test-kind
kubectl get nodes | grep -q Ready
kind delete cluster --name test-kind

echo "6. kubectl basics..."
kind create cluster --name test-kind2 --config .github/kind-config.yaml
kubectl create ns test-ns
kubectl run test-pod --image=nginx:alpine -n test-ns
kubectl wait --for=condition=Ready pod/test-pod -n test-ns --timeout=60s
kubectl delete ns test-ns
kind delete cluster --name test-kind2

echo "✅ Checkpoint 4.1 superado"
```

---

## Recursos post-sesión

- [Docker Swarm tutorial](https://docs.docker.com/engine/swarm/swarm-tutorial/)
- [Kubernetes concepts](https://kubernetes.io/docs/concepts/)
- [kubectl cheat sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [kind documentation](https://kind.sigs.k8s.io/docs/user/quick-start/)
- [k3d documentation](https://k3d.io/v5.6.0/usage/)