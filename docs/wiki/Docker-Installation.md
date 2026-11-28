# Docker installation

Install Docker Engine and the Compose plugin, then clone Garage:

```sh
git clone https://github.com/trentnbauer/Garage.git
cd Garage
cp .env.example .env
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Open http://localhost:3000 on the Docker host. Set the initial admin PIN. The default bind address is loopback; set GARAGE_BIND_ADDRESS=0.0.0.0 for LAN access, with appropriate firewall and authentication controls. Use HTTPS for remote access and passkeys.

The image supports linux/amd64 and linux/arm64. Data persists in the garage-data named volume at /data. The image supplies its own health check.

For Portainer, use compose.yaml as the stack definition and supply the .env file on the Docker host where Compose resolves it; do not assume Portainer stack variables automatically create that file.
