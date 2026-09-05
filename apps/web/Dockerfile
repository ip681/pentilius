# Build context is the repo root (needs access to packages/shared and root workspace files).
FROM node:24-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
RUN npm run build -w packages/shared

COPY apps/web apps/web
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build -w apps/web

FROM node:24-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /repo/apps/web ./apps/web

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
