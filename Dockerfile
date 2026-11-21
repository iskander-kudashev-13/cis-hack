# One image: web console (Vite build) + Go server (hub, demo bank nodes, API).
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS server
WORKDIR /src
COPY server/go.mod ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/scamweather ./cmd/scamweather

FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=server /out/scamweather /app/scamweather
COPY --from=web /web/dist /app/web/dist
USER app
ENV PORT=8080 WEB_DIR=/app/web/dist
EXPOSE 8080
CMD ["/app/scamweather"]
