FROM golang:1.21-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go .
RUN CGO_ENABLED=0 go build -o ssh-lab-server .

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/ssh-lab-server .
EXPOSE 8080
CMD ["./ssh-lab-server"]
