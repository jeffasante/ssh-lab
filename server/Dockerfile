FROM golang:alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go .
RUN CGO_ENABLED=0 go build -o ssh-lab-server .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates && rm -rf /var/lib/apt/lists/*
COPY wasmtime /usr/local/bin/wasmtime
WORKDIR /app
COPY --from=build /app/ssh-lab-server .
COPY c2w/debian.wasm /app/debian.wasm
EXPOSE 8080 9099
CMD ["./ssh-lab-server"]
