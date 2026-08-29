FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM base AS builder
WORKDIR /app
# Alpine's minimal image ships OpenSSL 3.x but no `openssl` package itself —
# without it, Prisma can't detect the libssl version and silently guesses
# wrong ("Defaulting to openssl-1.1.x"), then fails at runtime looking for
# a 1.1 lib that doesn't exist. Installing it lets `prisma generate` pick
# the correct engine binary for this image.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Scheduler: runs scripts/scheduler.ts (node-cron), NOT `next start`. Needs
# the full node_modules (tsx, node-cron) and raw source, unlike the trimmed
# standalone `runner` image below. tzdata is required for the TZ env var to
# actually affect what "Sunday 00:00" means.
FROM base AS scheduler
WORKDIR /app
RUN apk add --no-cache tzdata openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npx", "tsx", "scripts/scheduler.ts"]

FROM base AS runner
WORKDIR /app
# Belt-and-suspenders: app code computes all dates against a hardcoded
# Moscow (UTC+3) offset in src/lib/timezone.ts, independent of the
# container's own time zone — but set it anyway so anything that ever
# falls back to the system clock (logs, etc.) is still sane.
RUN apk add --no-cache tzdata openssl
ENV TZ=Europe/Moscow
ENV NODE_ENV=production
ENV PORT=9999
# Next.js standalone server.js defaults HOSTNAME from this — must be
# 0.0.0.0, not localhost/127.0.0.1, or the process only accepts loopback
# connections and is unreachable from outside the container (Render's own
# proxy included), even though the app itself starts up fine and logs look
# clean.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 9999
CMD ["node", "server.js"]
