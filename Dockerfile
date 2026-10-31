FROM bluenviron/mediamtx:1.21.2 AS mediamtx

FROM node:20-alpine

RUN apk add --no-cache openssl coturn
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
ENV PORT=3000
EXPOSE 3000 3478/udp

VOLUME ["/data"]

ENTRYPOINT ["./docker/entrypoint.sh"]
