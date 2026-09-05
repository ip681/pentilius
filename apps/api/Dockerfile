# Build context is the repo root (needs access to packages/shared and root workspace files).
FROM node:24-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared
RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM node:24-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma

WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
