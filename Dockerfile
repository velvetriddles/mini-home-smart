FROM golang:1.22-alpine AS build
WORKDIR /app
COPY . .
RUN go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=build /app/server .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["./server"] 