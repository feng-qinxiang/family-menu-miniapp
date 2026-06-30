package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class SeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);

    private final MysqlKitchenStore kitchenStore;

    public SeedRunner(MysqlKitchenStore kitchenStore) {
        this.kitchenStore = kitchenStore;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            kitchenStore.seedDefaults();
        } catch (RuntimeException ex) {
            log.warn("seedDefaults skipped: {}", ex.getMessage());
        }
    }
}
