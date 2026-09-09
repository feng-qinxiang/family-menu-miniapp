package com.familymenu.daily.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 最小可用的 .xlsx 生成器（零依赖）。
 *
 * 为什么手写而不是引 Apache POI：为了导出 Excel 引入一个几 MB 的依赖、外加
 * 一堆传递依赖和 CVE 面，不划算。xlsx 本质就是一个 zip + 几个 XML，
 * JDK 自带 ZipOutputStream 就够了。
 *
 * 支持：表头加粗配色 + 冻结首行 + 列宽 + 文本/数字/金额格式。
 * 不支持（也用不到）：公式、图表、多 sheet、共享字符串表（改用 inlineStr，省一层复杂度）。
 */
public final class XlsxWriter {

    private static final int MAX_COL_WIDTH = 60;
    private static final int MIN_COL_WIDTH = 8;

    private XlsxWriter() {
    }

    /**
     * @param sheetName    工作表名
     * @param headers      表头
     * @param rows         数据行；元素为 String / Number / null
     * @param moneyColumns 需要按两位小数金额格式显示的列下标（0 起）
     */
    public static byte[] build(String sheetName, List<String> headers, List<List<Object>> rows,
                               Set<Integer> moneyColumns) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
            put(zip, "[Content_Types].xml", contentTypes());
            put(zip, "_rels/.rels", rootRels());
            put(zip, "xl/workbook.xml", workbook(sheetName));
            put(zip, "xl/_rels/workbook.xml.rels", workbookRels());
            put(zip, "xl/styles.xml", styles());
            put(zip, "xl/worksheets/sheet1.xml", sheet(headers, rows, moneyColumns));
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("生成 xlsx 失败: " + ex.getMessage(), ex);
        }
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String sheet(List<String> headers, List<List<Object>> rows, Set<Integer> moneyColumns) {
        StringBuilder sb = new StringBuilder(4096);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                .append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">")
                .append("<sheetViews><sheetView workbookViewId=\"0\">")
                .append("<pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/>")
                .append("</sheetView></sheetViews>");

        // 列宽：按表头与内容长度估算，限制在 [8, 60]
        sb.append("<cols>");
        for (int c = 0; c < headers.size(); c++) {
            int width = headers.get(c) == null ? MIN_COL_WIDTH : displayWidth(headers.get(c));
            for (List<Object> row : rows) {
                if (c < row.size() && row.get(c) != null) {
                    width = Math.max(width, displayWidth(String.valueOf(row.get(c))));
                }
            }
            width = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width + 2));
            sb.append("<col min=\"").append(c + 1).append("\" max=\"").append(c + 1)
                    .append("\" width=\"").append(width).append("\" customWidth=\"1\"/>");
        }
        sb.append("</cols><sheetData>");

        // 表头（样式 1：加粗白字 + 深色底）
        sb.append("<row r=\"1\">");
        for (int c = 0; c < headers.size(); c++) {
            sb.append("<c r=\"").append(ref(c, 1)).append("\" s=\"1\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                    .append(escape(headers.get(c))).append("</t></is></c>");
        }
        sb.append("</row>");

        for (int r = 0; r < rows.size(); r++) {
            int rowNum = r + 2;
            List<Object> row = rows.get(r);
            sb.append("<row r=\"").append(rowNum).append("\">");
            for (int c = 0; c < row.size(); c++) {
                Object value = row.get(c);
                if (value == null) {
                    continue;
                }
                String cellRef = ref(c, rowNum);
                if (value instanceof Number number && !(value instanceof Boolean)) {
                    String style = moneyColumns != null && moneyColumns.contains(c) ? " s=\"2\"" : "";
                    sb.append("<c r=\"").append(cellRef).append("\"").append(style).append("><v>")
                            .append(number).append("</v></c>");
                } else {
                    sb.append("<c r=\"").append(cellRef).append("\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                            .append(escape(String.valueOf(value))).append("</t></is></c>");
                }
            }
            sb.append("</row>");
        }
        sb.append("</sheetData></worksheet>");
        return sb.toString();
    }

    /** 0 → A, 25 → Z, 26 → AA */
    private static String ref(int col, int row) {
        StringBuilder letters = new StringBuilder();
        int c = col;
        while (c >= 0) {
            letters.insert(0, (char) ('A' + (c % 26)));
            c = c / 26 - 1;
        }
        return letters + String.valueOf(row);
    }

    /** 中文按 2 个字符宽度估算，避免列宽把中文挤掉。 */
    private static int displayWidth(String text) {
        int width = 0;
        for (int i = 0; i < text.length(); i++) {
            width += text.charAt(i) > 0x2E80 ? 2 : 1;
        }
        return width;
    }

    private static String escape(String text) {
        if (text == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(text.length() + 16);
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            switch (ch) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&apos;");
                default -> {
                    // xlsx 不允许这些控制字符，直接丢弃
                    if (ch >= 0x20 || ch == '\t' || ch == '\n') {
                        sb.append(ch);
                    }
                }
            }
        }
        return sb.toString();
    }

    private static String contentTypes() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>"
                + "</Types>";
    }

    private static String rootRels() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
                + "</Relationships>";
    }

    private static String workbook(String sheetName) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" "
                + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
                + "<sheets><sheet name=\"" + escape(sheetName) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets>"
                + "</workbook>";
    }

    private static String workbookRels() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
                + "</Relationships>";
    }

    private static String styles() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                + "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.00\"/></numFmts>"
                + "<fonts count=\"2\">"
                + "<font><sz val=\"11\"/><name val=\"Calibri\"/></font>"
                + "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font>"
                + "</fonts>"
                + "<fills count=\"3\">"
                + "<fill><patternFill patternType=\"none\"/></fill>"
                + "<fill><patternFill patternType=\"gray125\"/></fill>"
                + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF2F4A3A\"/><bgColor indexed=\"64\"/></patternFill></fill>"
                + "</fills>"
                + "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
                + "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>"
                + "<cellXfs count=\"3\">"
                + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>"
                + "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/>"
                + "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>"
                + "</cellXfs>"
                + "</styleSheet>";
    }
}
