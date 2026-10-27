package cn.zhuoda.learner;

import org.junit.Test;
import static org.junit.Assert.*;

public class ServerAddressTest {
    @Test public void updateDownloadOnlyAcceptsTheConfiguredPublicApkRoute() {
        String path = "/api/apps/releases/9432b2ba-14fe-40e6-aa62-2502614a4b38/download";
        assertTrue(ServerAddress.isAppDownload("https://exam.example.com", "https://exam.example.com" + path));
        assertFalse(ServerAddress.isAppDownload("https://exam.example.com", "https://evil.example.com" + path));
        assertFalse(ServerAddress.isAppDownload("https://exam.example.com", "http://exam.example.com" + path));
        assertFalse(ServerAddress.isAppDownload("https://exam.example.com", "https://exam.example.com" + path + "?token=secret"));
        assertFalse(ServerAddress.isAppDownload("https://exam.example.com", "https://exam.example.com/other.apk"));
    }
    @Test public void normalizesDeploymentAndLanAddresses() {
        assertEquals("http://139.9.134.68", ServerAddress.normalize(" http://139.9.134.68/ "));
        assertEquals("https://exam.example.com", ServerAddress.normalize("EXAM.example.com"));
        assertEquals("http://192.168.1.10:5173", ServerAddress.normalize("http://192.168.1.10:5173"));
        assertEquals("http://[::1]:5173", ServerAddress.normalize("http://[::1]:5173/"));
    }

    @Test public void rejectsUnsafeOrNonRootAddresses() {
        for (String value : new String[]{"", "javascript:alert(1)", "file:///tmp", "ftp://server",
                "https://user:pass@example.com", "https://example.com/login", "https://example.com?x=1",
                "https://example.com/#token", "https://example.com:70000", "https://example.com:0",
                "https://exam ple.com", "http://example.com\\@evil.com"}) {
            assertThrows(value, IllegalArgumentException.class, () -> ServerAddress.normalize(value));
        }
    }

    @Test public void comparesCompleteOriginBeforeKeepingNavigationInsideApp() {
        assertTrue(ServerAddress.sameOrigin("http://139.9.134.68", "http://139.9.134.68/exam/my"));
        assertTrue(ServerAddress.sameOrigin("https://exam.example.com", "https://EXAM.example.com:443/login"));
        assertFalse(ServerAddress.sameOrigin("http://139.9.134.68", "http://139.9.134.68.evil.com/"));
        assertFalse(ServerAddress.sameOrigin("http://139.9.134.68", "https://139.9.134.68/"));
        assertFalse(ServerAddress.sameOrigin("http://139.9.134.68", "http://139.9.134.68:3001/api"));
        assertFalse(ServerAddress.sameOrigin("http://139.9.134.68", "javascript:alert(1)"));
        assertFalse(ServerAddress.sameOrigin("http://139.9.134.68", "http://evil@139.9.134.68/"));
    }
}
