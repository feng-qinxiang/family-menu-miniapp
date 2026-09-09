# ---- 构建阶段 ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# 先只拷 pom，利用 Docker 层缓存加速依赖下载
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
# 测试直连数据库，构建镜像时跳过；测试在 CI 里跑
RUN mvn -B -q clean package -DskipTests

# ---- 运行阶段 ----
FROM eclipse-temurin:17-jre
WORKDIR /app

# 非 root 运行
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /build/target/*.jar app.jar
RUN mkdir -p /app/uploads && chown -R app:app /app
USER app

ENV SPRING_PROFILES_ACTIVE=prod \
    UPLOAD_DIR=/app/uploads \
    SERVER_PORT=9088 \
    # 时区必须与 MySQL 一致：代码用 JVM 的 LocalDateTime.now() 与 MySQL NOW() 比较，
    # JVM 跑 UTC 会让验证码/会话过期时间差 8 小时（验证码可能"一生成就过期"）。
    TZ=Asia/Shanghai \
    JAVA_TOOL_OPTIONS="-Duser.timezone=Asia/Shanghai"

EXPOSE 9088

# 健康检查：/api/payment/plans 是公开只读接口，适合做探活
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["sh", "-c", "wget -qO- http://127.0.0.1:9088/api/payment/plans > /dev/null || exit 1"]

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
