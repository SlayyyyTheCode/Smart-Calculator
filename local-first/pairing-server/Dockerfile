# The pairing broker.
#
# No dependencies, no build step, no database — it is one file that holds a
# handful of two-minute sessions in memory. That is deliberate: there is nothing
# here worth persisting, and anything persisted is something to leak.
FROM node:22-alpine

# Runs unprivileged. The image ships with a `node` user; using it means a
# compromise of the process is not a compromise of the container.
USER node
WORKDIR /app

COPY --chown=node:node server.mjs ./

ENV PORT=4100
EXPOSE 4100

# No healthcheck curl: the image has none, and adding one to poll an endpoint
# that returns 404 by design would only add noise.
CMD ["node", "server.mjs"]
