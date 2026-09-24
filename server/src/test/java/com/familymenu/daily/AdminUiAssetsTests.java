package com.familymenu.daily;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 运营后台前端资产（admin.js / admin.css / index.html）的结构不变量。
 *
 * 为什么要有这个测试类：后台前端是**零构建**的裸资源，没有打包器、没有 lint、没有类型检查，
 * 改错一个字（少一列 colspan、把抽样逻辑写回 i===n-1）在服务端一行日志都不会有，
 * 只能靠人打开浏览器，而这类错误恰恰是"机器一眼能看出来"的。这里用最笨的办法把它钉住：
 * 读 classpath 上的资源做静态断言，跟着 {@code mvn verify} 一起跑，不引入任何前端工具链。
 *
 * 纯静态检查：不起 Spring 上下文、不连数据库，毫秒级。
 * 服务端接口与鉴权不在这里的覆盖范围内（见 AdminModulesTests / AdminRbacTests 等）。
 */
class AdminUiAssetsTests {

    /** 空态行：tableEmpty(colspan, …) */
    private static final Pattern TABLE_EMPTY = Pattern.compile("tableEmpty\\((\\d+)");
    /** 表头块：<thead> … </thead> */
    private static final Pattern THEAD = Pattern.compile("<thead>(.*?)</thead>", Pattern.DOTALL);

    private static String asset(String path) throws IOException {
        try (InputStream in = AdminUiAssetsTests.class.getClassLoader().getResourceAsStream(path)) {
            assertThat(in).as("classpath 上找不到 %s（资源没被打进 target/classes？）", path).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** 去掉块注释后再看代码：注释里正当地描述旧写法（"原来是 i % step …"）不该被当成残留 */
    private static String withoutComments(String js) {
        return js.replaceAll("(?s)/\\*.*?\\*/", "");
    }

    private static int occurrences(String haystack, String needle) {
        int n = 0;
        int at = haystack.indexOf(needle);
        while (at >= 0) {
            n++;
            at = haystack.indexOf(needle, at + needle.length());
        }
        return n;
    }

    /** 取某个函数的函数体（从签名到下一个顶格的两空格右括号），用于"这个函数里不许出现 X"这类断言 */
    private static String functionBody(String js, String signature) {
        int start = js.indexOf(signature);
        assertThat(start).as("admin.js 里找不到 %s —— 函数被改名或删掉了", signature).isGreaterThanOrEqualTo(0);
        int end = js.indexOf("\n  }", start);
        return js.substring(start, end < 0 ? js.length() : end);
    }

    /** 数一段表头 markup 渲染出几列：字面量 <th …> 每个一列，thSort(…) 每个也渲染一列 */
    private static int columnCount(String headMarkup) {
        int n = occurrences(headMarkup, "thSort(");
        Matcher th = Pattern.compile("<th[ >]").matcher(headMarkup);
        while (th.find()) {
            n++;
        }
        return n;
    }

    /**
     * 空态行的 colspan 必须等于同一张表的列数。
     *
     * 空态是在数据为空时才渲染的那一行，所以"列数写错"在本机有数据时永远看不见：
     * 线上某个筛选条件第一次返回空、或者新环境第一次打开时才会露出来，
     * 表现为整张表被撑歪、表头与内容彻底错位。
     */
    @Test
    void everyEmptyStateSpansExactlyItsOwnTableColumns() throws IOException {
        String js = asset("admin/admin.js");
        List<String> problems = new ArrayList<>();
        int checked = 0;
        Matcher empty = TABLE_EMPTY.matcher(js);
        while (empty.find()) {
            int colspan = Integer.parseInt(empty.group(1));
            Matcher head = THEAD.matcher(js);
            if (!head.find(empty.end())) {
                problems.add("tableEmpty(" + colspan + ") 之后找不到 <thead>，无法核对列数");
                continue;
            }
            int columns = columnCount(head.group(1));
            checked++;
            if (columns != colspan) {
                problems.add("tableEmpty(" + colspan + ") 与表头 " + columns + " 列不一致");
            }
        }
        assertThat(checked).as("没扫到任何空态行，正则或写法变了").isEqualTo(13);
        assertThat(problems).isEmpty();
    }

    /**
     * x 轴标签只能走 axisStep/axisLabelAt 的均匀抽样，不许再手写"补上最后一个标签"。
     *
     * 原来的写法 `i % step === 0 || i === n - 1` 里，末尾那个标签不受 step 约束，
     * 与前一个采样标签的距离可以小到 0：实测柱状图上 09-21 的右边界与 09-22 的左边界
     * 落在同一个 x 上，两个日期贴成了 "09-2109-22"。
     */
    @Test
    void chartAxisLabelsUseEvenSampling() throws IOException {
        String js = asset("admin/admin.js");
        String code = withoutComments(js);
        assertThat(code).as("强行补末尾标签会让最后两个日期贴在一起").doesNotContain("i === n - 1");
        assertThat(code).as("抽样必须走 axisLabelAt，不能再散写 i % step").doesNotContain("i % step");
        assertThat(occurrences(code, "axisLabelAt("))
                .as("折线图与柱状图都要用同一套抽样（含函数定义本身）")
                .isGreaterThanOrEqualTo(3);
    }

    /**
     * 表格宽过卡片时必须由卡片自己横向滚动兜底，而不是把表格画到卡片外面。
     *
     * 表格画出去会带出整页横向滚动条，最右列（列表页的「操作」）直接看不见。
     * 兜底阈值挂在 .panel-root 上而不是 .main 上：卡片宽 = .panel-root 的内容宽，
     * 而大屏下 .main 比卡片宽（卡片被 --content-max 收窄了），
     * 挂 .main 会让大屏误判成"放得下"。
     */
    @Test
    void cardKeepsAHorizontalOverflowSafetyNet() throws IOException {
        String css = asset("admin/admin.css");
        assertThat(css).contains("@container");
        assertThat(css).contains(".panel-root { container:");
        assertThat(css).contains(".card { overflow-x: auto; }");
        assertThat(css).as("吸顶表头必须落在顶栏下方，写 top:0 会被顶栏盖住")
                .contains("top: var(--topbar-h)");
    }

    /**
     * 页内不再重复渲染标题 —— 标题由顶栏（面包屑 + #pageTitle）承担。
     * 两边都渲染时，同一个屏幕上会出现两次同样的字。
     */
    @Test
    void pageHeadDoesNotRepeatTheTopbarTitle() throws IOException {
        String js = asset("admin/admin.js");
        assertThat(functionBody(js, "function pageHead(")).doesNotContain("<h2>");
    }

    /**
     * 时间列不折行、被截断的列必须带 title。
     *
     * 时间列折成两行会把行高从 47px 顶到 61px，整页节奏被打乱；
     * 而 td.clamp 截掉的正是最需要原文的那几列（说明/内容/详情），
     * 没有 title 就等于内容只读了一半、还没法看全。
     */
    @Test
    void timeAndClampedColumnsKeepTheirFullValueReachable() throws IOException {
        String js = asset("admin/admin.js");
        assertThat(js).as("时间列统一写成 <td class=\"nowrap\" title=…>，不应再有裸 <td title=…>")
                .doesNotContain("<td title=");
        List<String> problems = new ArrayList<>();
        Matcher clamp = Pattern.compile("class=\"clamp\"").matcher(js);
        while (clamp.find()) {
            String tail = js.substring(clamp.end(), Math.min(js.length(), clamp.end() + 12));
            if (!tail.startsWith(" title=")) {
                problems.add("class=\"clamp\" 之后跟的是 " + tail.trim() + "，缺 title");
            }
        }
        assertThat(problems).isEmpty();
        assertThat(occurrences(js, "class=\"clamp\"")).as("截断列不该被整体删掉").isGreaterThan(0);
    }

    /**
     * 引导登录必须是并列的分段选项，并且可用性由服务端渲染进页面。
     *
     * 短信网关没接入时它是唯一进得去的入口，藏在折叠区里的代价是"后台打不开"。
     * 可用性**不许前端打接口探测**：那个端点有 5 次/分钟的限流且不计响应码
     * （同一分钟刷新登录页 5 次，第 6 次连真正的引导登录都 429），空令牌探测
     * 还会在控制台留下一条 401。服务端本来就知道答案，渲染进 <body> 即可。
     */
    @Test
    void bootstrapLoginStaysReachableFromTheLoginPage() throws IOException {
        String html = asset("admin/index.html");
        String js = asset("admin/admin.js");
        assertThat(html).contains("id=\"authTabs\"").contains("id=\"authPaneBootstrap\"");
        assertThat(html).as("不能再退回折叠区").doesNotContain("<details");
        assertThat(html).as("可用性由 AdminPageController 渲染，占位符不能被删掉")
                .contains("data-bootstrap-login=\"__ADMIN_BOOTSTRAP_AVAILABLE__\"");
        assertThat(js).contains("data-bootstrap-login");
        assertThat(js).as("不再打接口探测引导登录，否则会吃掉 5 次/分钟的限流额度")
                .doesNotContain("auth/bootstrap', { method: 'POST', body: { token: '' }");
    }

    /**
     * 调试期留下的探针不许跟着发版：这些代码会把运行期数据写进浏览器控制台，
     * 原注释里就写着"定位完即移除"。
     */
    @Test
    void noDebugProbesLeftInShippedAssets() throws IOException {
        String js = asset("admin/admin.js");
        assertThat(js).doesNotContain("dbgTrace", "__adminTrace", "agent log", "#region");
    }

    /**
     * 自己的行上「调整角色」必须是禁用的。
     *
     * 服务端硬拒绝改自己的角色（AdminService.setAdminRole → 403「不能修改自己的角色」，
     * 行为由 AdminRbacTests 守着）。前端原来照常渲染这个按钮，点「保存角色」必然失败 ——
     * 巡检 B2 的确认路径就是这么在管理员自己那一行上吃到两条 403 的（空提交 + 填值提交）。
     * 这里钉住两件事一起在：按钮禁用，以及 state.userId 真的从 /api/admin/me 取。
     * 少了后者，`self` 恒为假、禁用形同不存在，那两条 403 会原样回来。
     */
    @Test
    void ownRowCannotOfferTheRoleActionTheServerRefuses() throws IOException {
        String js = asset("admin/admin.js");
        assertThat(js).as("self 判定依赖 /api/admin/me 的 userId")
                .contains("state.userId = me.userId");
        assertThat(js).as("自己的行上「调整角色」必须禁用（title 说明原因），否则点了就是 403")
                .contains("self ? ' disabled title=\"不能修改自己的角色\"'");
    }
}
