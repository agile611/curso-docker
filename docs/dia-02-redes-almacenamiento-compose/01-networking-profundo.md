# Día 2 - 01: Zero-shot y few-shot (Networking profundo)

## Objetivos de la sesión

- [ ] Entender a fondo los drivers de red: bridge, host, none, overlay, macvlan, ipvlan.
- [ ] Configurar redes personalizadas: subnets, gateway, IPAM, MTU.
- [ ] Depurar conectividad: `nsenter`, `tcpdump`, `ss`, `iptables`.
- [ ] Service discovery: DNS embebido, alias, search domains.
- [ ] Network policies básicas (iptables) y limitaciones.

---

## Dinámica

| Tiempo | Actividad |
|--------|-----------|
| 10 min | Recap día 1 + preguntas networking |
| 30 min | Teoría avanzada: drivers, IPAM, DNS, CNI |
| 20 min | Demo: `nsenter`, `tcpdump` en contenedor, `iptables` |
| 10 min | Break |
| 50 min | Laboratorio guiado: redes personalizadas, debug, overlay |
| 20 min | Laboratorio autónomo: escenario multi-host simulado |
| 10 min | Preguntas + checkpoint |

---

## Drivers de red: comparativa técnica

| Driver | Kernel module | Encapsulación | Multi-host | Performance | Caso de uso |
|--------|---------------|---------------|------------|-------------|-------------|
| `bridge` | `bridge` | Ninguna (L2) | No | Nativa | Default, single host |
| `host` | N/A | Ninguna | No | Máxima | High perf, legacy apps |
| `none` | N/A | N/A | No | N/A | Aislamiento total |
| `overlay` | `vxlan` | VXLAN (L2 over L3) | **Sí** | ~10-15% overhead | Swarm, K8s (CNI) |
| `macvlan` | `macvlan` | Ninguna (L2) | No | Nativa | IP por contenedor en LAN |
| `ipvlan` | `ipvlan` | L3 (L3 over L3) | No | Nativa | Mismo MAC, IPs distintas |

### Bridge: internals

```
Host
├── docker0 (bridge default) 172.17.0.1/16
│   ├── vethxxxx (contenedor A) → eth0 @ 172.17.0.2
│   └── vethyyyy (contenedor B) → eth0 @ 172.17.0.3
├── br-xxxxx (red custom) 172.28.0.1/16
│   ├── vethaaaa (api) → eth0 @ 172.28.0.2
│   └── vethbbbb (db) → eth0 @ 172.28.0.3
```

- **veth pair**: virtual ethernet pair (un extremo en host, otro en netns contenedor).
- **NAT**: `iptables -t nat -A POSTROUTING -s 172.28.0.0/16 ! -o br-xxxxx -j MASQUERADE`
- **DNS**: `127.0.0.11` en cada netns → Docker DNS server.

### Overlay: VXLAN

```
Host A (192.168.1.10)          Host B (192.168.1.11)
┌─────────────────────┐        ┌─────────────────────┐
│ overlay-net (VXLAN) │◄──────►│ overlay-net (VXLAN) │
│ VNI: 4096           │  UDP   │ VNI: 4096           │
│ 10.0.0.0/24         │  4789  │ 10.0.0.0/24         │
└─────────────────────┘        └─────────────────────┘
        │                              │
   ┌────┴────┐                    ┌────┴────┐
   │ cont A  │                    │ cont B  │
   │ 10.0.0.2│                    │ 10.0.0.3│
   └─────────┘                    └─────────┘
```

- **VXLAN**: encapsula frames L2 en UDP 4789.
- **Control plane**: Swarm usa Raft (consul/etcd en K8s) para mapear MAC ↔ VTEP IP.
- **MTU**: Reducir 50 bytes (1450 vs 1500) por header VXLAN.

### Macvlan / Ipvlan

```bash
# Macvlan: cada contenedor tiene MAC única en interfaz física
docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 \
  macvlan-net

# Ipvlan: misma MAC (host), IPs distintas (L3)
docker network create -d ipvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 \
  -o ipvlan_mode=l2 \
  ipvlan-net
```

**Requisitos**: Switch soporta promiscuous mode (macvlan) / configuración L3 (ipvlan). No funciona en cloud VMs típicas.

---

## IPAM (IP Address Management)

### Configuración avanzada

```bash
# Red con IPAM personalizado
docker network create --driver bridge \
  --subnet=10.10.0.0/16 \
  --gateway=10.10.0.1 \
  --ip-range=10.10.1.0/24 \
  --opt com.docker.network.bridge.name=br-custom \
  --opt com.docker.network.driver.mtu=1450 \
  mi-red-custom

# IPAM con rangos reservados
docker network create --driver bridge \
  --subnet=172.30.0.0/16 \
  --gateway=172.30.0.1 \
  --aux-address="reserved1=172.30.0.10" \
  --aux-address="reserved2=172.30.0.11" \
  mi-red-reserved
```

### Asignar IP fija a contenedor

```bash
docker run -d --name api \
  --network mi-red \
  --ip 172.28.0.10 \
  mi-api
```

---

## Service Discovery: DNS profundo

### Estructura DNS en contenedor

```bash
# /etc/resolv.conf
nameserver 127.0.0.11
search mi-red.local
options ndots:0

# /etc/hosts (gestionado por Docker)
127.0.0.1   localhost
172.28.0.2  api.mi-red.local api
172.28.0.3  db.mi-red.local db
```

### Consultas DNS

```bash
# Desde contenedor en red "mi-red"
dig api.mi-red.local        # A record → IP
dig api                     # Search domain → api.mi-red.local
dig SRV _http._tcp.api.mi-red.local  # SRV records (si configurado)

# Docker DNS también resuelve:
# - container_name
# - container_name.network_name
# - service_name (en Compose/Swarm)
```

### Aliases de red (Compose)

```yaml
services:
  api:
    networks:
      backend-net:
        aliases:
          - api.internal
          - api.v1.internal
```

```bash
# Desde otro contenedor en backend-net
curl http://api.internal:3000/healthz
curl http://api.v1.internal:3000/healthz
```

---

## Depuración de red: herramientas esenciales

### nsenter: entrar en netns de contenedor

```bash
# Obtener PID del contenedor
PID=$(docker inspect -f '{{.State.Pid}}' api)

# Entrar en network namespace
nsenter -t $PID -n ss -tulpn
nsenter -t $PID -n ip addr show
nsenter -t $PID -n ip route show
nsenter -t $PID -n cat /etc/resolv.conf
nsenter -t $PID -n cat /etc/hosts

# Ejecutar comando en netns
nsenter -t $PID -n curl -v http://db:5432
nsenter -t $PID -n tcpdump -i any -n port 5432
```

### tcpdump en host (ver tráfico de contenedor)

```bash
# Encontrar interfaz veth del contenedor
VETH=$(docker exec api cat /sys/class/net/eth0/iflink)
VETH_HOST=$(grep -l $VETH /sys/class/net/veth*/ifindex 2>/dev/null | head -1 | xargs basename)

# Capturar en interfaz host
tcpdump -i $VETH_HOST -n -s 0 -w capture.pcap

# O capturar en bridge
tcpdump -i br-xxxxx -n port 3000
```

### iptables: ver reglas Docker

```bash
# NAT (MASQUERADE)
iptables -t nat -L DOCKER -n -v

# Filter (FORWARD)
iptables -L DOCKER-USER -n -v
iptables -L DOCKER -n -v

# Reglas de red específica
iptables -L DOCKER-ISOLATION-STAGE-1 -n -v
```

### ss / netstat en contenedor

```bash
# Puertos escuchando
docker exec api ss -tulpn

# Conexiones establecidas
docker exec api ss -tuapn

# Estadísticas
docker exec api ss -s
```

---

## Laboratorio guiado: redes personalizadas + debug

### 1. Crear red bridge con IPAM custom

```bash
docker network create --driver bridge \
  --subnet=172.30.0.0/16 \
  --gateway=172.30.0.1 \
  --ip-range=172.30.1.0/24 \
  --opt com.docker.network.bridge.name=br-lab \
  lab-net

docker network inspect lab-net
```

### 2. Desplegar servicios con IPs fijas

```bash
docker run -d --name db \
  --network lab-net \
  --ip 172.30.1.10 \
  -v pgdata-lab:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

docker run -d --name api \
  --network lab-net \
  --ip 172.30.1.20 \
  -e DATABASE_URL=postgresql://postgres:postgres@172.30.1.10:5432/postgres \
  ghcr.io/usuario/api:latest
```

### 3. Debug con nsenter

```bash
PID=$(docker inspect -f '{{.State.Pid}}' api)

# Ver interfaces
nsenter -t $PID -n ip addr show

# Ver rutas
nsenter -t $PID -n ip route show

# Test conectividad
nsenter -t $PID -n ping -c 2 172.30.1.10
nsenter -t $PID -n nc -zv 172.30.1.10 5432

# DNS
nsenter -t $PID -n dig db.lab-net
nsenter -t $PID -n dig @127.0.0.11 db.lab-net
```

### 4. Capturar tráfico con tcpdump

```bash
# Encontrar veth
VETH=$(docker exec api cat /sys/class/net/eth0/iflink)
VETH_HOST=$(grep -l $VETH /sys/class/net/veth*/ifindex 2>/dev/null | head -1 | xargs basename)

# Capturar handshake TCP
tcpdump -i $VETH_HOST -n -s 0 'tcp[tcpflags] & (tcp-syn|tcp-ack) != 0' -w handshake.pcap

# En otro terminal: generar tráfico
docker exec api curl -s http://172.30.1.10:5432 >/dev/null 2>&1 || true

# Analizar
tcpdump -r handshake.pcap -n
```

### 5. Overlay network (simulado single-node Swarm)

```bash
docker swarm init
docker network create --driver overlay --attachable lab-overlay

docker run -d --name api-overlay \
  --network lab-overlay \
  ghcr.io/usuario/api:latest

docker run -d --name worker-overlay \
  --network lab-overlay \
  ghcr.io/usuario/worker:latest

# Test DNS overlay
docker exec worker-overlay nslookup api-overlay
docker exec worker-overlay curl -f http://api-overlay:3000/healthz
```

---

## Laboratorio autónomo: Escenario multi-host simulado

### Escenario

Simular 2 hosts (usando 2 redes bridge separadas + contenedor "router") para entender limitaciones de bridge vs overlay.

```
Host A (bridge A)          Router (contenedor)          Host B (bridge B)
172.31.0.0/16              172.31.0.1 / 172.32.0.1      172.32.0.0/16
    │                           │                           │
  api ──────────────────────────┼────────────────────────── db
    │                           │                           │
```

### Tareas

1. Crear 2 redes bridge: `host-a-net` (172.31.0.0/16), `host-b-net` (172.32.0.0/16).
2. Crear contenedor "router" con 2 interfaces (una en cada red) + `sysctl net.ipv4.ip_forward=1`.
3. Desplegar `api` en `host-a-net`, `db` en `host-b-net`.
4. Configurar rutas estáticas en api y db hacia router.
5. Probar conectividad api → db.
6. Comparar con overlay: ¿qué es más simple? ¿Qué overhead?

### Pistas

```bash
# Router
docker run -d --name router --privileged \
  --network host-a-net --ip 172.31.0.1 \
  alpine:3.20 sh -c "sysctl -w net.ipv4.ip_forward=1 && sleep infinity"

# Conectar router a segunda red
docker network connect host-b-net router --ip 172.32.0.1

# Rutas en api
docker exec api ip route add 172.32.0.0/16 via 172.31.0.1

# Rutas en db
docker exec db ip route add 172.31.0.0/16 via 172.32.0.1
```

---

## Checkpoint validación

```bash
# validate.sh lab-2-1
#!/usr/bin/env bash
set -euo pipefail

echo "1. Red lab-net existe con IPAM custom..."
docker network inspect lab-net | jq -e '.[0].IPAM.Config[0].Subnet == "172.30.0.0/16"' || exit 1

echo "2. Contenedores con IP fija..."
docker inspect db --format '{{.NetworkSettings.Networks.lab-net.IPAddress}}' | grep -q '172.30.1.10'
docker inspect api --format '{{.NetworkSettings.Networks.lab-net.IPAddress}}' | grep -q '172.30.1.20'

echo "3. nsenter funciona..."
PID=$(docker inspect -f '{{.State.Pid}}' api)
nsenter -t $PID -n ip route show | grep -q '172.30.0.0/16'

echo "4. DNS resuelve nombres..."
docker exec api nslookup db.lab-net | grep -q '172.30.1.10'

echo "5. Overlay network funcional..."
docker exec worker-overlay curl -f http://api-overlay:3000/healthz

echo "✅ Checkpoint 2.1 superado"
```

---

## Recursos post-sesión

- [Docker network internals](https://docs.docker.com/network/bridge/)
- [Overlay network driver](https://docs.docker.com/network/overlay/)
- [Macvlan driver](https://docs.docker.com/network/macvlan/)
- [Container networking from scratch](https://github.com/containerd/containerd/blob/main/docs/NETWORKING.md)
- [nsenter tutorial](https://man7.org/linux/man-pages/man1/nsenter.1.html)