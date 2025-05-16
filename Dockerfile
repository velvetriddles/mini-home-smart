FROM golang:1.22-alpine AS build
WORKDIR /app
COPY . .
RUN go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=build /app/server .
COPY ./boot/bootstrap.sh /app/bootstrap.sh
RUN apk add --no-cache wget && chmod +x /app/bootstrap.sh
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/bootstrap.sh"] 