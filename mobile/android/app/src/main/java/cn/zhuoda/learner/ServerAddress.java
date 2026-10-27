package cn.zhuoda.learner;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** 地址只接受服务根路径。相对 API、附件、视频保持与网页同源。 */
final class ServerAddress {
    private ServerAddress() {}

    static String normalize(String value) {
        String input = value.trim();
        if (!input.contains("://")) input = "https://" + input;
        try {
            URI uri = new URI(input);
            String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
            if ((!scheme.equals("https") && !scheme.equals("http"))
                    || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || (uri.getRawPath() != null && !uri.getRawPath().matches("/*"))
                    || uri.getPort() > 65535 || uri.getPort() == 0) {
                throw new IllegalArgumentException("请输入服务器根地址，例如 https://exam.example.com");
            }
            return new URI(scheme, null, uri.getHost().toLowerCase(Locale.ROOT),
                    uri.getPort(), null, null, null).toString();
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("服务器地址格式不正确", e);
        }
    }

    static boolean sameOrigin(String server, String target) {
        try {
            URI a = new URI(server);
            URI b = new URI(target);
            return a.getScheme().equalsIgnoreCase(b.getScheme())
                    && a.getHost().equalsIgnoreCase(b.getHost())
                    && effectivePort(a) == effectivePort(b)
                    && b.getRawUserInfo() == null;
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean isAppDownload(String server, String target) {
        if (!sameOrigin(server, target)) return false;
        try {
            URI uri = new URI(target);
            return uri.getRawQuery() == null && uri.getRawFragment() == null
                    && uri.getRawPath().matches("/api/apps/releases/[a-f0-9-]{36}/download");
        } catch (Exception ignored) { return false; }
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() != -1 ? uri.getPort() : ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80);
    }
}
