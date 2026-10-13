# While You're Out: the MCP server, the parent page and the Echo Show simulator in one container.
# Runs on any Docker host (the live demo is on Render, which sets PORT itself).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY simulator/package.json simulator/
RUN npm ci
COPY . .
RUN npm run build -w simulator

FROM node:24-slim
WORKDIR /app
ENV HOST=0.0.0.0 \
    PORT=7860 \
    WYO_DB=/tmp/while-youre-out.db \
    WYO_DEMO=1 \
    WYO_ESCALATE_MS=30000
COPY --from=build /app /app
# Run as the unprivileged "node" user.
USER node
EXPOSE 7860
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/src/index.ts"]
