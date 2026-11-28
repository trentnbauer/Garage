# Configuration

Copy .env.example to .env. Compose uses GARAGE_IMAGE_TAG, GARAGE_BIND_ADDRESS and GARAGE_HOST_PORT for deployment. Garage listens on port 3000 inside the container. TZ controls the container timezone.

Optional settings are listed in .env.example, matching server/env.js. Uncomment only those you intend to control through the environment. An empty variable still overrides the stored value and locks its Admin settings field. Restart with docker compose up -d after changes.

Use Admin settings for sign-in, OAuth/OIDC, AI providers, SMTP and Cloudflare. Admin settings → Export .env can export application settings; merge them into your deployment file rather than replacing it blindly. Keep PORT=3000 for this Compose configuration. Protect .env and database backups because they may contain credentials. Never commit real secrets.

Passkeys require HTTPS or localhost. OAuth requires the redirect URI displayed by Garage and provider credentials. Cloudflare Access with a blank allowlist can expose the application publicly; review access policy before enabling a tunnel.
