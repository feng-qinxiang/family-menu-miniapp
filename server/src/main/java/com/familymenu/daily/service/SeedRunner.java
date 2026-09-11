package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
public class SeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);

    private final MysqlKitchenStore kitchenStore;
    private final AdminService adminService;
    private final JdbcTemplate jdbcTemplate;
    private final DataSource dataSource;

    /**
     * 是否注入演示数据（种子账号、社区帖子、演示家庭与菜单等）。
     * 默认 false：演示数据会在运营后台里变成一堆"凭空出现的账号与家庭"，与小程序对不上。
     * 本地需要造演示数据时显式设 APP_SEED_DEMO_DATA=true；生产（application-prod.yml）固定 false。
     */
    private final boolean seedDemoData;

    public SeedRunner(MysqlKitchenStore kitchenStore,
                      AdminService adminService,
                      JdbcTemplate jdbcTemplate,
                      DataSource dataSource,
                      @Value("${app.seed-demo-data:false}") boolean seedDemoData) {
        this.kitchenStore = kitchenStore;
        this.adminService = adminService;
        this.jdbcTemplate = jdbcTemplate;
        this.dataSource = dataSource;
        this.seedDemoData = seedDemoData;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (seedDemoData) {
            try {
                kitchenStore.seedDefaults();
            } catch (RuntimeException ex) {
                log.warn("seedDefaults skipped: {}", ex.getMessage());
            }
            runDemoSql();
        } else {
            log.info("演示数据播种已关闭 (app.seed-demo-data=false)：只保留公共菜谱库");
        }

        // 管理员白名单播种：只升权不降权；白名单为空时不做任何事（默认安全）。
        // 与演示数据无关，生产也需要执行。
        try {
            adminService.seedBootstrapAdmins();
        } catch (RuntimeException ex) {
            log.warn("seedBootstrapAdmins skipped: {}", ex.getMessage());
        }

        verifySchema();
    }

    /**
     * 执行 data-demo.sql（种子账号、演示会员/订单、演示菜单与购物清单等）。
     *
     * 必须排在 seedDefaults() 之后：脚本里有靠 openid 关联种子账号（阿宁/小周/猫猫）的 UPDATE。
     * 脚本自身用 INSERT IGNORE / UPDATE，可重复执行。
     */
    private void runDemoSql() {
        try {
            ResourceDatabasePopulator populator =
                    new ResourceDatabasePopulator(new ClassPathResource("data-demo.sql"));
            populator.setSqlScriptEncoding("UTF-8");
            // 幂等脚本：个别语句在已有数据上重复执行失败（如主键冲突）不该阻断启动
            populator.setContinueOnError(true);
            populator.execute(dataSource);
        } catch (RuntimeException ex) {
            log.warn("data-demo.sql skipped: {}", ex.getMessage());
        }
    }

    /**
     * 启动自检：核心表不存在时立即失败。
     *
     * 背景：生产建库是手动执行 SQL，如果只跑了 create-database.sql（只建库、不建表），
     * 应用照样能启动成功，但每个接口都返回 500 —— 部署者很难定位。
     * 这里主动检查并抛出明确错误，让部署失败在启动阶段而不是用户请求阶段。
     */
    private void verifySchema() {
        String missing = null;
        for (String table : new String[]{"user_account", "family", "family_member", "recipe", "user_session"}) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                    Integer.class, table);
            if (count == null || count == 0) {
                missing = table;
                break;
            }
        }
        if (missing != null) {
            String message = "数据库缺少核心表 `" + missing + "`，应用无法正常工作。"
                    + "请先执行建表脚本：mysql -u<user> -p <库名> < src/main/resources/schema.sql"
                    + "（详见 spec/LAUNCH-CHECKLIST.md 第 7 节）";
            log.error(message);
            throw new IllegalStateException(message);
        }
    }
}
