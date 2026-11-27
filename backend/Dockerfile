FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew build.gradle settings.gradle ./
COPY gradle gradle
COPY src src
RUN ./gradlew --no-daemon bootJar

FROM build AS test
RUN ./gradlew --no-daemon test

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl && addgroup -S lens && adduser -S -G lens lens
COPY --from=build /app/build/libs/product-lens.jar /app.jar
USER lens
ENTRYPOINT ["java","-XX:MaxRAMPercentage=70","-jar","/app.jar"]
