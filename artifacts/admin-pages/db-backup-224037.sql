-- MySQL dump 10.13  Distrib 8.4.9, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: family_menu_daily_db
-- ------------------------------------------------------
-- Server version	8.4.9

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `community_post`
--

DROP TABLE IF EXISTS `community_post`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_post` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `recipe_id` bigint DEFAULT NULL,
  `author_user_id` bigint NOT NULL,
  `title` varchar(128) NOT NULL,
  `content` text NOT NULL,
  `like_count` int NOT NULL DEFAULT '0',
  `comment_count` int NOT NULL DEFAULT '0',
  `tags_json` text NOT NULL,
  `audit_status` varchar(16) NOT NULL DEFAULT 'PENDING',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_post_audit` (`audit_status`,`like_count` DESC),
  KEY `idx_post_author` (`author_user_id`),
  KEY `idx_post_recipe` (`recipe_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_post`
--

LOCK TABLES `community_post` WRITE;
/*!40000 ALTER TABLE `community_post` DISABLE KEYS */;
INSERT INTO `community_post` VALUES (1,6,1,'分享我的麻婆豆腐做法','用嫩豆腐口感更好，关键是最后勾芡要薄，让汤汁裹住豆腐。花椒粉一定要最后撒，香气才足。',12,44,'[\"川菜\",\"下饭\",\"辣\"]','APPROVED','2026-08-03 21:36:34','2026-09-10 19:18:02'),(2,8,1,'糖醋排骨的秘诀','排骨先炸后炒是关键，糖醋汁比例 2:3:4（糖:醋:水），最后大火收汁挂上亮油。',8,1,'[\"粤菜\",\"宴客\",\"酸甜\"]','APPROVED','2026-08-03 21:36:34','2026-08-03 21:36:34'),(3,2,2,'周末家常三菜一汤','这套组合适合一家四口，做起来不复杂，味道比较稳。',128,20,'[\"家庭\",\"三菜一汤\",\"实用\"]','APPROVED','2026-08-03 21:36:35','2026-08-25 17:18:47'),(4,1,3,'下班 20 分钟快手餐','用番茄炒蛋和蒜蓉西兰花，配米饭就够了。',96,10,'[\"快手\",\"晚餐\",\"省时\"]','APPROVED','2026-08-03 21:36:35','2026-08-03 21:36:35'),(5,7,4,'我把西兰花步骤改顺手了','蒜末不要炒太久，西兰花焯完沥干再下锅，最后只要快炒几下。',75,9,'[\"家常\",\"配菜\",\"经验\"]','APPROVED','2026-08-03 21:36:35','2026-08-03 21:36:35'),(6,1,1602,'冒烟测试帖','这是一条冒烟测试内容，用于验证发帖链路。',0,0,'[\"测试\"]','APPROVED','2026-09-09 23:36:05','2026-09-09 23:36:05'),(7,112,1602,'冒烟测试帖2','冒烟测试内容',0,1,'[\"测试\"]','APPROVED','2026-09-09 23:36:21','2026-09-09 23:36:21'),(8,NULL,1852,'审核链路验证帖','这条应该进待审队列',0,0,'[\"测试\"]','PENDING','2026-09-09 23:56:23','2026-09-09 23:56:23');
/*!40000 ALTER TABLE `community_post` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_post_comment`
--

DROP TABLE IF EXISTS `community_post_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_post_comment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `post_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `content` varchar(500) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` tinyint(1) NOT NULL DEFAULT '0',
  `audit_status` varchar(16) NOT NULL DEFAULT 'APPROVED',
  PRIMARY KEY (`id`),
  KEY `idx_comment_post` (`post_id`,`id` DESC),
  KEY `idx_comment_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=118 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_post_comment`
--

LOCK TABLES `community_post_comment` WRITE;
/*!40000 ALTER TABLE `community_post_comment` DISABLE KEYS */;
INSERT INTO `community_post_comment` VALUES (1,3,8,'这套搭配稳，适合周末。','2026-08-03 21:36:35',0,'APPROVED'),(2,3,8,'我会把辣度稍微调低一点。','2026-08-03 21:36:35',0,'APPROVED'),(3,4,8,'这个组合确实快，晚饭很实用。','2026-08-03 21:36:35',0,'APPROVED'),(4,5,8,'导入后最好再把步骤拆细一点。','2026-08-03 21:36:35',0,'APPROVED'),(5,3,102,'端到端评论','2026-08-04 18:41:25',0,'APPROVED'),(6,3,117,'端到端评论','2026-08-04 18:51:24',0,'APPROVED'),(7,3,167,'端到端评论','2026-08-04 19:18:03',0,'APPROVED'),(8,3,202,'手测评论，表单走完。','2026-08-25 17:18:47',0,'APPROVED'),(9,1,841,'管理台下架测试评论','2026-09-08 20:14:26',0,'APPROVED'),(10,1,859,'管理台下架测试评论','2026-09-08 20:14:57',1,'APPROVED'),(11,1,883,'管理台下架测试评论','2026-09-08 20:16:40',1,'APPROVED'),(12,1,955,'管理台下架测试评论','2026-09-08 20:18:25',1,'APPROVED'),(13,1,1031,'管理台下架测试评论','2026-09-08 21:38:06',1,'APPROVED'),(14,1,1109,'管理台下架测试评论','2026-09-08 21:39:41',1,'APPROVED'),(15,1,1200,'管理台下架测试评论','2026-09-08 22:42:16',1,'APPROVED'),(16,1,1207,'管理台评论列表测试','2026-09-08 22:42:16',0,'APPROVED'),(17,1,1287,'管理台下架测试评论','2026-09-08 22:47:21',1,'APPROVED'),(18,1,1294,'管理台评论列表测试','2026-09-08 22:47:22',0,'APPROVED'),(19,1,1368,'管理台下架测试评论','2026-09-08 22:49:13',1,'APPROVED'),(20,1,1375,'管理台评论列表测试','2026-09-08 22:49:13',0,'APPROVED'),(21,1,1456,'管理台下架测试评论','2026-09-08 22:52:29',1,'APPROVED'),(22,1,1463,'管理台评论列表测试','2026-09-08 22:52:30',0,'APPROVED'),(23,1,1537,'管理台下架测试评论','2026-09-09 23:33:41',1,'APPROVED'),(24,1,1544,'管理台评论列表测试','2026-09-09 23:33:41',0,'APPROVED'),(25,7,1602,'冒烟评论','2026-09-09 23:36:21',0,'APPROVED'),(26,1,1624,'管理台下架测试评论','2026-09-09 23:50:16',1,'PENDING'),(27,1,1631,'管理台评论列表测试','2026-09-09 23:50:17',0,'PENDING'),(28,1,1705,'管理台下架测试评论','2026-09-09 23:50:54',1,'PENDING'),(29,1,1712,'管理台评论列表测试','2026-09-09 23:50:55',0,'PENDING'),(30,1,1786,'管理台下架测试评论','2026-09-09 23:53:08',1,'PENDING'),(31,1,1793,'管理台评论列表测试','2026-09-09 23:53:08',0,'PENDING'),(32,8,1853,'待审评论内容','2026-09-09 23:56:23',0,'PENDING'),(33,1,1874,'管理台下架测试评论','2026-09-09 23:58:01',1,'PENDING'),(34,1,1881,'管理台评论列表测试','2026-09-09 23:58:01',0,'PENDING'),(35,1,1955,'管理台下架测试评论','2026-09-09 23:59:37',1,'PENDING'),(36,1,1962,'管理台评论列表测试','2026-09-09 23:59:37',0,'PENDING'),(37,1,2036,'管理台下架测试评论','2026-09-10 00:02:00',1,'PENDING'),(38,1,2043,'管理台评论列表测试','2026-09-10 00:02:01',0,'PENDING'),(40,1,2121,'管理台下架测试评论','2026-09-10 00:02:29',1,'PENDING'),(41,1,2128,'管理台评论列表测试','2026-09-10 00:02:29',0,'PENDING'),(43,1,2206,'管理台下架测试评论','2026-09-10 00:02:55',1,'PENDING'),(44,1,2213,'管理台评论列表测试','2026-09-10 00:02:55',0,'PENDING'),(45,1,2275,'实时验证-待审评论','2026-09-10 00:05:08',1,'REMOVED'),(47,1,2320,'管理台下架测试评论','2026-09-10 00:29:57',1,'PENDING'),(48,1,2327,'管理台评论列表测试','2026-09-10 00:29:58',0,'PENDING'),(50,1,2407,'管理台下架测试评论','2026-09-10 00:39:04',1,'PENDING'),(51,1,2414,'管理台评论列表测试','2026-09-10 00:39:04',0,'PENDING'),(53,1,2494,'管理台下架测试评论','2026-09-10 00:51:02',1,'PENDING'),(54,1,2501,'管理台评论列表测试','2026-09-10 00:51:02',0,'PENDING'),(56,1,2587,'管理台下架测试评论','2026-09-10 00:54:15',1,'PENDING'),(57,1,2594,'管理台评论列表测试','2026-09-10 00:54:16',0,'PENDING'),(59,1,2676,'管理台下架测试评论','2026-09-10 01:01:01',1,'APPROVED'),(62,1,2686,'管理台评论列表测试','2026-09-10 01:01:02',0,'REMOVED'),(64,1,2774,'管理台下架测试评论','2026-09-10 01:20:25',1,'PENDING'),(67,1,2784,'管理台评论列表测试','2026-09-10 01:20:26',0,'PENDING'),(69,1,2866,'管理台下架测试评论','2026-09-10 01:20:59',1,'PENDING'),(72,1,2876,'管理台评论列表测试','2026-09-10 01:21:00',0,'PENDING'),(74,1,2981,'管理台下架测试评论','2026-09-10 12:09:37',1,'PENDING'),(77,1,2991,'管理台评论列表测试','2026-09-10 12:09:38',0,'PENDING'),(79,1,3080,'管理台下架测试评论','2026-09-10 12:09:58',1,'PENDING'),(82,1,3090,'管理台评论列表测试','2026-09-10 12:09:58',0,'PENDING'),(84,1,3204,'管理台下架测试评论','2026-09-10 12:55:25',1,'PENDING'),(87,1,3214,'管理台评论列表测试','2026-09-10 12:55:26',0,'PENDING'),(89,1,3328,'管理台下架测试评论','2026-09-10 19:01:08',1,'PENDING'),(92,1,3338,'管理台评论列表测试','2026-09-10 19:01:09',0,'PENDING'),(94,1,3433,'管理台下架测试评论','2026-09-10 19:06:29',1,'PENDING'),(97,1,3443,'管理台评论列表测试','2026-09-10 19:06:30',0,'PENDING'),(99,1,3538,'管理台下架测试评论','2026-09-10 19:09:57',1,'PENDING'),(102,1,3548,'管理台评论列表测试','2026-09-10 19:09:57',0,'PENDING'),(104,1,3648,'管理台下架测试评论','2026-09-10 19:13:40',1,'PENDING'),(107,1,3658,'管理台评论列表测试','2026-09-10 19:13:40',0,'PENDING'),(109,1,3758,'管理台下架测试评论','2026-09-10 19:15:39',1,'PENDING'),(112,1,3768,'管理台评论列表测试','2026-09-10 19:15:40',0,'PENDING'),(114,1,3868,'管理台下架测试评论','2026-09-10 19:18:02',1,'PENDING'),(117,1,3878,'管理台评论列表测试','2026-09-10 19:18:02',0,'PENDING');
/*!40000 ALTER TABLE `community_post_comment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_post_report`
--

DROP TABLE IF EXISTS `community_post_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_post_report` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `post_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `reason` varchar(128) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'PENDING',
  `reviewer_user_id` bigint DEFAULT NULL,
  `review_note` varchar(255) DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_report_post` (`post_id`),
  KEY `idx_report_status` (`status`,`id` DESC)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_post_report`
--

LOCK TABLES `community_post_report` WRITE;
/*!40000 ALTER TABLE `community_post_report` DISABLE KEYS */;
INSERT INTO `community_post_report` VALUES (1,3,119,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:52:33',NULL),(2,3,120,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:52:57',NULL),(3,3,121,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:53:31',NULL),(4,3,122,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:54:12',NULL),(5,3,123,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:54:53',NULL),(6,3,124,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:55:30',NULL),(7,3,125,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 18:56:44',NULL),(8,3,128,'内容不实','PENDING',NULL,NULL,NULL,'2026-08-04 19:14:48',NULL),(9,3,136,'步骤不全','PENDING',NULL,NULL,NULL,'2026-08-04 19:17:32','步骤跳过了调味'),(10,3,136,'内容不实','IGNORED',202,'核实无违规，保留内容','2026-08-25 17:21:20','2026-08-04 19:17:32',NULL),(11,7,1602,'内容不实','PENDING',NULL,NULL,NULL,'2026-09-09 23:36:22','冒烟');
/*!40000 ALTER TABLE `community_post_report` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_post_favorite`
--

DROP TABLE IF EXISTS `community_post_favorite`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_post_favorite` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `post_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_post_user` (`post_id`,`user_id`),
  KEY `idx_fav_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_post_favorite`
--

LOCK TABLES `community_post_favorite` WRITE;
/*!40000 ALTER TABLE `community_post_favorite` DISABLE KEYS */;
INSERT INTO `community_post_favorite` VALUES (1,3,102,'2026-08-04 18:41:25'),(2,3,109,'2026-08-04 18:47:57'),(3,3,117,'2026-08-04 18:51:24'),(4,3,118,'2026-08-04 18:51:37'),(5,3,119,'2026-08-04 18:52:33'),(6,3,120,'2026-08-04 18:52:56'),(7,3,121,'2026-08-04 18:53:31'),(8,3,122,'2026-08-04 18:54:12'),(9,3,123,'2026-08-04 18:54:52'),(10,3,124,'2026-08-04 18:55:30'),(11,3,125,'2026-08-04 18:56:44'),(12,3,127,'2026-08-04 19:14:13'),(13,3,128,'2026-08-04 19:14:47'),(14,3,167,'2026-08-04 19:18:03'),(15,7,1602,'2026-09-09 23:36:21');
/*!40000 ALTER TABLE `community_post_favorite` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `feedback_ticket`
--

DROP TABLE IF EXISTS `feedback_ticket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedback_ticket` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `family_id` bigint NOT NULL,
  `types_json` text NOT NULL,
  `content` text NOT NULL,
  `contact` varchar(128) DEFAULT NULL,
  `images_json` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'OPEN',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `handled_by` bigint DEFAULT NULL,
  `handled_at` datetime DEFAULT NULL,
  `reply` text,
  PRIMARY KEY (`id`),
  KEY `idx_feedback_family` (`family_id`,`created_at` DESC),
  KEY `idx_feedback_status` (`status`,`id` DESC)
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feedback_ticket`
--

LOCK TABLES `feedback_ticket` WRITE;
/*!40000 ALTER TABLE `feedback_ticket` DISABLE KEYS */;
INSERT INTO `feedback_ticket` VALUES (1,9,3,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-03 21:36:35',NULL,NULL,NULL),(2,39,21,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-03 22:14:30',NULL,NULL,NULL),(3,69,39,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-03 22:15:07',NULL,NULL,NULL),(4,143,80,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-04 19:17:46',NULL,NULL,NULL),(5,202,100,'[\"feature\",\"bug\"]','手测：意见反馈表单走完一遍。','13900112233','[]','OPEN','2026-08-25 17:16:31',NULL,NULL,NULL),(6,247,117,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-28 20:44:42',NULL,NULL,NULL),(7,314,137,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-28 22:42:22',NULL,NULL,NULL),(8,389,161,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-08-30 22:27:09',NULL,NULL,NULL),(9,443,184,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 19:46:57',NULL,NULL,NULL),(10,486,203,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 19:47:12',NULL,NULL,NULL),(11,585,242,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:03:08',NULL,NULL,NULL),(12,8,2,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:06:38',NULL,NULL,NULL),(13,688,282,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:09:27',NULL,NULL,NULL),(14,714,296,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:09:50',NULL,NULL,NULL),(15,786,332,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:12:46',NULL,NULL,NULL),(16,843,371,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 20:14:27',844,'2026-09-08 20:14:27','已处理'),(17,861,383,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 20:14:57',862,'2026-09-08 20:14:57','已处理'),(18,885,395,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 20:16:40',886,'2026-09-08 20:16:40','已处理'),(19,900,404,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:16:41',NULL,NULL,NULL),(20,957,443,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 20:18:25',958,'2026-09-08 20:18:25','已处理'),(21,972,452,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 20:18:26',NULL,NULL,NULL),(22,1033,495,'[\"bug\"]','管理台测试工单',NULL,'[]','OPEN','2026-09-08 21:38:06',NULL,NULL,NULL),(23,1049,505,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 21:38:07',NULL,NULL,NULL),(24,1111,549,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 21:39:41',1112,'2026-09-08 21:39:41','已处理'),(25,1127,559,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 21:39:42',NULL,NULL,NULL),(26,1202,604,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 22:42:16',1203,'2026-09-08 22:42:16','已处理'),(27,1220,616,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 22:42:17',NULL,NULL,NULL),(28,1289,661,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 22:47:21',1290,'2026-09-08 22:47:21','已处理'),(29,1307,673,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 22:47:23',NULL,NULL,NULL),(30,1370,718,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 22:49:13',1371,'2026-09-08 22:49:13','已处理'),(31,1388,730,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 22:49:15',NULL,NULL,NULL),(32,1458,776,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-08 22:52:29',1459,'2026-09-08 22:52:29','已处理'),(33,1476,788,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-08 22:52:31',NULL,NULL,NULL),(34,1539,833,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:33:41',1540,'2026-09-09 23:33:41','已处理'),(35,1557,845,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:33:42',NULL,NULL,NULL),(36,1602,875,'[\"功能建议\"]','冒烟测试反馈',NULL,'[]','OPEN','2026-09-09 23:36:22',NULL,NULL,NULL),(37,1626,893,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:50:16',1627,'2026-09-09 23:50:16','已处理'),(38,1644,905,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:50:17',NULL,NULL,NULL),(39,1707,950,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:50:54',1708,'2026-09-09 23:50:54','已处理'),(40,1725,962,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:50:56',NULL,NULL,NULL),(41,1788,1007,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:53:08',1789,'2026-09-09 23:53:08','已处理'),(42,1806,1019,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:53:09',NULL,NULL,NULL),(43,1876,1070,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:58:01',1877,'2026-09-09 23:58:01','已处理'),(44,1894,1082,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:58:02',NULL,NULL,NULL),(45,1957,1127,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-09 23:59:37',1958,'2026-09-09 23:59:37','已处理'),(46,1975,1139,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-09 23:59:39',NULL,NULL,NULL),(47,2038,1184,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:02:00',2039,'2026-09-10 00:02:00','已处理'),(48,2056,1196,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:02:02',NULL,NULL,NULL),(49,2123,1245,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:02:29',2124,'2026-09-10 00:02:29','已处理'),(50,2141,1257,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:02:30',NULL,NULL,NULL),(51,2208,1306,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:02:55',2209,'2026-09-10 00:02:55','已处理'),(52,2226,1318,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:02:56',NULL,NULL,NULL),(53,2322,1372,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:29:57',2323,'2026-09-10 00:29:57','已处理'),(54,2340,1384,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:29:58',NULL,NULL,NULL),(55,2409,1435,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:39:04',2410,'2026-09-10 00:39:04','已处理'),(56,2427,1447,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:39:05',NULL,NULL,NULL),(57,2496,1498,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:51:02',2497,'2026-09-10 00:51:02','已处理'),(58,2514,1510,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:51:03',NULL,NULL,NULL),(59,2589,1561,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 00:54:15',2590,'2026-09-10 00:54:15','已处理'),(60,2607,1573,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 00:54:17',NULL,NULL,NULL),(61,2681,1629,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 01:01:01',2682,'2026-09-10 01:01:01','已处理'),(62,2699,1641,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 01:01:03',NULL,NULL,NULL),(63,2779,1697,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 01:20:26',2780,'2026-09-10 01:20:26','已处理'),(64,2797,1709,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 01:20:27',NULL,NULL,NULL),(65,2871,1765,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 01:20:59',2872,'2026-09-10 01:20:59','已处理'),(66,2896,1784,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 01:21:01',NULL,NULL,NULL),(67,2986,1842,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 12:09:37',2987,'2026-09-10 12:09:37','已处理'),(68,3011,1861,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 12:09:39',NULL,NULL,NULL),(69,3085,1917,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 12:09:58',3086,'2026-09-10 12:09:58','已处理'),(70,3110,1936,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 12:10:00',NULL,NULL,NULL),(71,3209,1992,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 12:55:25',3210,'2026-09-10 12:55:26','已处理'),(72,3234,2011,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 12:55:28',NULL,NULL,NULL),(73,3333,2067,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:01:09',3334,'2026-09-10 19:01:09','已处理'),(74,3358,2086,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:01:10',NULL,NULL,NULL),(75,3438,2142,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:06:29',3439,'2026-09-10 19:06:29','已处理'),(76,3463,2161,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:06:32',NULL,NULL,NULL),(77,3543,2217,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:09:57',3544,'2026-09-10 19:09:57','已处理'),(78,3568,2236,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:09:58',NULL,NULL,NULL),(79,3653,2294,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:13:40',3654,'2026-09-10 19:13:40','已处理'),(80,3678,2313,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:13:42',NULL,NULL,NULL),(81,3763,2371,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:15:39',3764,'2026-09-10 19:15:39','已处理'),(82,3788,2390,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:15:41',NULL,NULL,NULL),(83,3873,2448,'[\"bug\"]','管理台测试工单',NULL,'[]','CLOSED','2026-09-10 19:18:02',3874,'2026-09-10 19:18:02','已处理'),(84,3898,2467,'[\"bug\"]','测试反馈内容','test@example.com','[]','OPEN','2026-09-10 19:18:04',NULL,NULL,NULL);
/*!40000 ALTER TABLE `feedback_ticket` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-10 22:40:38
