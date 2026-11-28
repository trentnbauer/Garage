# Administration and backups

## Operations

```sh
docker compose ps
docker compose logs --tail=100 garage
docker compose restart garage
```

## Backup

Stop Garage before copying its SQLite database and uploaded files. From the repository directory:

```sh
mkdir -p backups
docker compose stop garage
docker compose run --rm --no-deps --user root --entrypoint tar garage -C /data -czf - . > backups/garage-data.tar.gz
docker compose start garage
tar -tzf backups/garage-data.tar.gz | head
```

Check each command succeeds, retain dated copies off-host, and test restoration. Back up .env separately and securely.

## Restore

Stop Garage, preserve the existing volume as a rollback copy, and restore into an empty /data volume. With a fresh Compose volume:

```sh
docker compose run --rm --no-deps -T --user root --entrypoint tar garage -C /data -xzf - < backups/garage-data.tar.gz
docker compose up -d
```

Verify ownership, sign-in, vehicles and attachments. Do not run docker compose down -v unless intentionally deleting the data volume.

## Update

Back up first. Change GARAGE_IMAGE_TAG in .env to the desired published version, then run docker compose pull && docker compose up -d. Check health and logs. Database changes may require restoring a matching backup to roll back safely.
