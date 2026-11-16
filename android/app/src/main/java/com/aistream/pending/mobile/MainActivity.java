package com.aistream.pending.mobile;

/**
 * AIStream 影视 · 安卓手机端原生壳
 * 内嵌一个仅监听 127.0.0.1 的极简静态服务，把 assets/www 以同源 http 提供，
 * 从而让 ES Modules / Service Worker / PWA 在 WebView 内正常工作（file:// 会阻止模块加载）。
 * 不依赖任何第三方 Android 库，仅使用 SDK 自带 API。
 */
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final String UPSTREAM_HOST = "fnos.jiulingkeji.asia:8890";

    private static final String ENTRY = "/mobile.html?platform=mobile";
    private WebView web;
    private ServerSocket server;
    private volatile boolean running = true;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int port = startLocalServer();
        if (port == 0) { finish(); return; }

        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0D14);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setUserAgentString(s.getUserAgentString() + " AIStreamMobile/1.0");
        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost();
                if ("127.0.0.1".equals(host) || "localhost".equals(host)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.loadUrl("http://127.0.0.1:" + port + ENTRY);
    }

    private int startLocalServer() {
        try {
            server = new ServerSocket(0, 24, InetAddress.getByName("127.0.0.1"));
            final int port = server.getLocalPort();
            new Thread(new Runnable() {
                @Override public void run() {
                    while (running) {
                        try {
                            final Socket c = server.accept();
                            pool.execute(new Runnable() {
                                @Override public void run() { handle(c); }
                            });
                        } catch (Exception ignored) { }
                    }
                }
            }, "aistream-http").start();
            return port;
        } catch (Exception e) {
            return 0;
        }
    }

    private void handle(Socket c) {
        try {
            c.setSoTimeout(20000);
            InputStream is = c.getInputStream();
            BufferedReader in = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String line = in.readLine();
            if (line == null) { c.close(); return; }
            String[] parts = line.split(" ");
            if (parts.length < 2) { c.close(); return; }
            String raw = parts[1];
            String path = raw;
            int q = raw.indexOf('?');
            if (q >= 0) path = raw.substring(0, q);
            if (path.contains("..")) path = "/__blocked__";

            HashMap<String, String> headers = new HashMap<>();
            String h;
            while ((h = in.readLine()) != null && h.length() > 0) {
                int i = h.indexOf(':');
                if (i > 0) headers.put(h.substring(0, i).trim().toLowerCase(Locale.US), h.substring(i + 1).trim());
            }

            // 内容源 API：同源代理转发（解决响应无 CORS 头），透传 Bearer 与请求体
            // 片源流中转（第三方 m3u8 / mp4 无 CORS 头）：必须先于 /api/* 内容源代理判断
            if ("/api/proxy".equals(path)) { proxyStream(c, raw, parts[0], headers); return; }
            if (path.startsWith("/api/")) { proxyApi(c, raw, parts[0], headers, in); return; }

            if ("/".equals(path)) path = "/index.html";
            serve(c, path);
        } catch (Exception ignored) {
            try { c.close(); } catch (Exception e2) { }
        }
    }

    private void serve(Socket c, String path) throws IOException {
        OutputStream out = c.getOutputStream();
        byte[] body = null;
        try {
            InputStream in = getAssets().open("www" + path);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] tmp = new byte[8192];
            int n;
            while ((n = in.read(tmp)) > 0) buf.write(tmp, 0, n);
            in.close();
            body = buf.toByteArray();
        } catch (IOException notFound) {
            body = new byte[0];
        }
        String status = body.length == 0 ? "404 Not Found" : "200 OK";
        String head = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + mime(path) + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes("UTF-8"));
        out.write(body);
        out.flush();
        c.close();
    }

    /** /api/* → http://<内容源>/api/*，透传 Authorization / POST body */
    private void proxyApi(Socket c, String rawPath, String method,
                          Map<String, String> headers, BufferedReader in) {
        HttpURLConnection conn = null;
        OutputStream out = null;
        try {
            out = c.getOutputStream();
            URL u = new URL("http://" + UPSTREAM_HOST + rawPath);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setInstanceFollowRedirects(false);
            for (Map.Entry<String, String> e : headers.entrySet()) {
                String k = e.getKey();
                if (k.equals("host") || k.equals("connection") || k.equals("content-length")
                        || k.equals("accept-encoding") || k.equals("origin") || k.equals("referer")) continue;
                conn.setRequestProperty(k, e.getValue());
            }
            int len = 0;
            try { len = Integer.parseInt(headers.get("content-length") == null ? "0" : headers.get("content-length")); }
            catch (Exception ignored) { }
            if (("POST".equals(method) || "PUT".equals(method)) && len > 0) {
                conn.setDoOutput(true);
                char[] buf = new char[len];
                int off = 0, n;
                while (off < len && (n = in.read(buf, off, len - off)) > 0) off += n;
                OutputStream os = conn.getOutputStream();
                os.write(new String(buf, 0, off).getBytes("UTF-8"));
                os.flush(); os.close();
            }
            int code = conn.getResponseCode();
            InputStream ris = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (ris != null) {
                byte[] b = new byte[8192]; int n;
                while ((n = ris.read(b)) > 0) bo.write(b, 0, n);
                ris.close();
            }
            byte[] body = bo.toByteArray();
            String ct = conn.getContentType() == null ? "application/json; charset=utf-8" : conn.getContentType();
            String head = "HTTP/1.1 " + code + " OK\r\n"
                    + "Content-Type: " + ct + "\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(head.getBytes("UTF-8"));
            out.write(body);
            out.flush();
        } catch (Exception e) {
            try {
                byte[] b = ("{\"error\":\"内容源代理失败\"}").getBytes("UTF-8");
                String head = "HTTP/1.1 502 Bad Gateway\r\nContent-Type: application/json; charset=utf-8\r\n"
                        + "Content-Length: " + b.length + "\r\nConnection: close\r\n\r\n";
                out.write(head.getBytes("UTF-8")); out.write(b); out.flush();
            } catch (Exception ignored) { }
        } finally {
            if (conn != null) conn.disconnect();
            try { c.close(); } catch (Exception ignored) { }
        }
    }

    /** /api/proxy?u= → 片源中转；m3u8 内分片 / 密钥 URI 重写为本地代理，Range 透传、302 跟随 */
    private void proxyStream(Socket c, String rawPath, String method, Map<String, String> headers) {
        OutputStream out = null;
        HttpURLConnection conn = null;
        try {
            out = c.getOutputStream();
            String target = null;
            int qi = rawPath.indexOf('?');
            if (qi >= 0) {
                for (String kv : rawPath.substring(qi + 1).split("&")) {
                    int e = kv.indexOf('=');
                    if (e > 0 && "u".equals(kv.substring(0, e))) {
                        target = java.net.URLDecoder.decode(kv.substring(e + 1), "UTF-8");
                    }
                }
            }
            if (target == null || !(target.startsWith("http://") || target.startsWith("https://"))) {
                byte[] b = "{\"error\":\"缺少或非法的 u 参数\"}".getBytes("UTF-8");
                out.write(("HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: "
                        + b.length + "\r\nConnection: close\r\n\r\n").getBytes("UTF-8"));
                out.write(b); out.flush(); c.close(); return;
            }
            URL url = new URL(target);
            int redirects = 0;
            int code;
            while (true) {
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 AIStream/1.0");
                conn.setRequestProperty("Accept", "*/*");
                String range = headers.get("range");
                if (range != null) conn.setRequestProperty("Range", range);
                code = conn.getResponseCode();
                if (code >= 300 && code < 400 && redirects < 5) {
                    String loc = conn.getHeaderField("Location");
                    if (loc != null) { url = new URL(url, loc); redirects++; conn.disconnect(); continue; }
                }
                break;
            }
            String ct = conn.getContentType() == null ? "" : conn.getContentType();
            String finalUrl = url.toString();
            boolean m3u8 = ct.toLowerCase(Locale.US).contains("mpegurl") || finalUrl.contains(".m3u8");
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (m3u8 && is != null) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                is.close();
                String rewritten = rewriteM3u8(new String(bo.toByteArray(), "UTF-8"), finalUrl);
                byte[] body = rewritten.getBytes("UTF-8");
                String head = "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl; charset=utf-8\r\n"
                        + "Content-Length: " + body.length + "\r\nAccess-Control-Allow-Origin: *\r\n"
                        + "Cache-Control: no-store\r\nConnection: close\r\n\r\n";
                out.write(head.getBytes("UTF-8")); out.write(body); out.flush();
            } else {
                StringBuilder head = new StringBuilder();
                head.append("HTTP/1.1 ").append(code).append(" OK\r\n");
                head.append("Content-Type: ").append(ct.isEmpty() ? "application/octet-stream" : ct).append("\r\n");
                String cl = conn.getHeaderField("Content-Length");
                if (cl != null) head.append("Content-Length: ").append(cl).append("\r\n");
                String cr = conn.getHeaderField("Content-Range");
                if (cr != null) head.append("Content-Range: ").append(cr).append("\r\n");
                head.append("Accept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\n")
                    .append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
                out.write(head.toString().getBytes("UTF-8"));
                if (is != null) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
                    out.flush();
                }
            }
        } catch (Exception e) {
            try {
                byte[] b = "{\"error\":\"流中转失败\"}".getBytes("UTF-8");
                out.write(("HTTP/1.1 502 Bad Gateway\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: "
                        + b.length + "\r\nConnection: close\r\n\r\n").getBytes("UTF-8"));
                out.write(b); out.flush();
            } catch (Exception ignored) { }
        } finally {
            if (conn != null) conn.disconnect();
            try { c.close(); } catch (Exception ignored) { }
        }
    }

    private String rewriteM3u8(String text, String baseUrl) {
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\n")) {
            String s = line.trim();
            if (s.isEmpty()) { sb.append(line).append('\n'); continue; }
            if (s.startsWith("#")) sb.append(rewriteUriAttrs(line, baseUrl)).append('\n');
            else sb.append(wrapProxy(resolveUrl(baseUrl, s))).append('\n');
        }
        return sb.toString();
    }

    private String rewriteUriAttrs(String line, String baseUrl) {
        StringBuilder sb = new StringBuilder();
        int idx = 0;
        while (true) {
            int p = line.indexOf("URI=\"", idx);
            if (p < 0) { sb.append(line.substring(idx)); break; }
            sb.append(line, idx, p + 5);
            int q = line.indexOf('"', p + 5);
            if (q < 0) { sb.append(line.substring(p + 5)); break; }
            sb.append(wrapProxy(resolveUrl(baseUrl, line.substring(p + 5, q))));
            idx = q;
        }
        return sb.toString();
    }

    private String wrapProxy(String abs) {
        try { return "/api/proxy?u=" + java.net.URLEncoder.encode(abs, "UTF-8").replace("+", "%20"); }
        catch (Exception e) { return abs; }
    }

    private String resolveUrl(String base, String rel) {
        try { return new URL(new URL(base), rel).toString(); } catch (Exception e) { return rel; }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html; charset=utf-8";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (p.endsWith(".css")) return "text/css; charset=utf-8";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json; charset=utf-8";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".md")) return "text/markdown; charset=utf-8";
        return "application/octet-stream";
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
