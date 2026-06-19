#!/usr/bin/env bash
# Build the niche-discovery image and install the daily cron on the VPS.
# Run from this directory (discovery/) on the VPS, where discover.py / run.py /
# Dockerfile live. Pulls Supabase + Apify creds from the running worker container
# at run time, so no secrets are stored here.
set -euo pipefail
cd "$(dirname "$0")"

docker build -t twinai-discovery:latest .

install -d /opt/twinai-discovery
cat > /opt/twinai-discovery/run.sh <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
SUP_URL=$(docker exec twinai-worker printenv SUPABASE_URL)
SUP_KEY=$(docker exec twinai-worker printenv SUPABASE_SERVICE_ROLE_KEY)
APIFY=$(docker exec twinai-worker printenv APIFY_TOKEN 2>/dev/null || echo '')
docker run --rm \
  -e SUPABASE_URL="$SUP_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUP_KEY" \
  -e APIFY_TOKEN="$APIFY" \
  -e DISCOVERY_NICHES="${DISCOVERY_NICHES:-[\"Business\",\"Fitness\",\"Food\",\"Education\",\"Lifestyle\",\"Beauty\"]}" \
  -e DISCOVERY_YT_LIMIT="${DISCOVERY_YT_LIMIT:-12}" \
  -e DISCOVERY_TT_LIMIT="${DISCOVERY_TT_LIMIT:-12}" \
  -e DISCOVERY_IG_LIMIT="${DISCOVERY_IG_LIMIT:-3}" \
  twinai-discovery:latest
WRAP
chmod +x /opt/twinai-discovery/run.sh

# Daily at 06:17 UTC. De-dupe against any prior entry for this job.
( crontab -l 2>/dev/null | grep -v 'twinai-discovery/run.sh' ; \
  echo '17 6 * * * /opt/twinai-discovery/run.sh >> /var/log/twinai-discovery.log 2>&1' ) | crontab -

echo "✓ twinai-discovery image built + daily cron installed (06:17 UTC)"
