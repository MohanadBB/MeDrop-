/* ==========================================================================
   MedDrop – Java back end (Application layer, report §18)

   1. Serves the website (index.html, css/, js/) from the project folder.
   2. POST /api/recognize – the AI Integration subsystem (§18.3). It receives a photo
      of a medicine package from the browser and sends it to a vision-capable AI API
      (Anthropic Claude Messages API). This is the
        householdUser1 → AI Recognition API : recognizeMedicine(photo) → identifiedDetails
      message of SD UC-01. The API key stays on the server and is never sent to the browser.

   Run from the project folder (Java 11 or newer, no libraries needed):
       export ANTHROPIC_API_KEY=sk-ant-...        (Windows: set ANTHROPIC_API_KEY=sk-ant-...)
       java server/MedDropServer.java
   then open http://localhost:8080

   Optional settings:  PORT (default 8080)
                       MEDDROP_AI_MODEL (default claude-sonnet-5-5)
                       MEDDROP_AI_URL   (default https://api.anthropic.com/v1/messages)
   ========================================================================== */

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MedDropServer {

    static final Path ROOT = Paths.get("").toAbsolutePath().normalize();
    static final int PORT = Integer.parseInt(env("PORT", "8080"));
    static final String AI_URL = env("MEDDROP_AI_URL", "https://api.anthropic.com/v1/messages");
    static final String AI_MODEL = env("MEDDROP_AI_MODEL", "claude-sonnet-5-5");
    static final String API_KEY = System.getenv("ANTHROPIC_API_KEY");
    static final int MAX_UPLOAD = 8 * 1024 * 1024;              // 8 MB of base64 text
    static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/gif");
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    static final Map<String, String> CONTENT_TYPES = Map.of(
            "html", "text/html; charset=utf-8", "css", "text/css; charset=utf-8",
            "js", "text/javascript; charset=utf-8", "png", "image/png", "jpg", "image/jpeg",
            "svg", "image/svg+xml", "json", "application/json", "ico", "image/x-icon");

    /* Same lists as DOSAGE_FORMS and CATEGORIES in js/models.js */
    static final String PROMPT =
            "You read photos of medicine packaging for a medicine-return app. Look at the image and reply with ONLY a JSON object with these keys:\n"
          + "{\"recognized\": boolean (false if this is not a readable medicine package),\n"
          + " \"medicineName\": string (active ingredient or name as printed),\n"
          + " \"dosage\": string (strength, e.g. \"500 mg\" or \"250 mg/5 ml\"; \"\" if unreadable),\n"
          + " \"dosageForm\": one of [\"Tablet\",\"Capsule\",\"Syrup\",\"Suspension\",\"Drops\",\"Cream\",\"Ointment\",\"Gel\",\"Inhaler\",\"Nasal spray\",\"Injection\",\"Pre-filled pen\",\"Patch\",\"Suppository\",\"Powder\",\"Other\"] or \"\",\n"
          + " \"medicineCategory\": one of [\"tablets\",\"liquids\",\"topical\",\"inhalers\",\"antibiotics\",\"supplements\",\"injectables\",\"controlled\",\"hazardous\",\"other\"]"
          + " (insulin/needles = injectables; opioids, benzodiazepines = controlled; chemotherapy = hazardous),\n"
          + " \"quantity\": integer number of packs visible (default 1),\n"
          + " \"expiryDate\": \"YYYY-MM-DD\" (if only month/year is printed use the last day of that month; \"\" if not visible)}\n"
          + "Do not guess values you cannot read; use \"\" instead. Reply with the JSON object only.";

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/api/recognize", MedDropServer::recognize);
        server.createContext("/api/status", MedDropServer::status);
        server.createContext("/", MedDropServer::staticFile);
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("MedDrop is running at http://localhost:" + PORT);
        System.out.println(API_KEY == null || API_KEY.isBlank()
                ? "Photo reading is OFF: set the ANTHROPIC_API_KEY environment variable and restart."
                : "Photo reading is ON (model " + AI_MODEL + ").");
    }

    /* GET /api/status – lets the page know whether photo reading is set up */
    static void status(HttpExchange ex) throws IOException {
        boolean on = API_KEY != null && !API_KEY.isBlank();
        send(ex, 200, "application/json", "{\"aiConfigured\":" + on + "}");
    }

    /* POST /api/recognize   body: {"mediaType":"image/jpeg","data":"<base64>"}
       Returns the AI API's JSON answer unchanged; js/ai-api.js reads the text from it. */
    static void recognize(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { send(ex, 405, "application/json", "{\"error\":\"method_not_allowed\"}"); return; }
        if (API_KEY == null || API_KEY.isBlank()) { send(ex, 503, "application/json", "{\"error\":\"no_key\"}"); return; }

        String body = readBody(ex.getRequestBody());
        if (body == null) { send(ex, 413, "application/json", "{\"error\":\"too_large\"}"); return; }

        String mediaType = find(body, "\"mediaType\"\\s*:\\s*\"([a-z/]+)\"");
        String data = find(body, "\"data\"\\s*:\\s*\"([A-Za-z0-9+/=]+)\"");
        if (mediaType == null || !IMAGE_TYPES.contains(mediaType) || data == null) {
            send(ex, 400, "application/json", "{\"error\":\"bad_image\"}");
            return;
        }

        String request = "{"
                + "\"model\":" + json(AI_MODEL) + ","
                + "\"max_tokens\":400,"
                + "\"messages\":[{\"role\":\"user\",\"content\":["
                + "{\"type\":\"image\",\"source\":{\"type\":\"base64\",\"media_type\":" + json(mediaType) + ",\"data\":\"" + data + "\"}},"
                + "{\"type\":\"text\",\"text\":" + json(PROMPT) + "}"
                + "]}]}";

        try {
            HttpRequest call = HttpRequest.newBuilder(URI.create(AI_URL))
                    .timeout(Duration.ofSeconds(60))
                    .header("content-type", "application/json")
                    .header("x-api-key", API_KEY)
                    .header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(request))
                    .build();
            HttpResponse<String> answer = HTTP.send(call, HttpResponse.BodyHandlers.ofString());
            if (answer.statusCode() == 429) { send(ex, 429, "application/json", "{\"error\":\"rate_limited\"}"); return; }
            if (answer.statusCode() != 200) {
                System.err.println("AI API error " + answer.statusCode() + ": " + answer.body());
                send(ex, 502, "application/json", "{\"error\":\"ai_failed\"}");
                return;
            }
            send(ex, 200, "application/json", answer.body());
        } catch (Exception e) {
            System.err.println("AI API unreachable: " + e);
            send(ex, 502, "application/json", "{\"error\":\"ai_unreachable\"}");
        }
    }

    /* Serves files from the project folder; never outside it */
    static void staticFile(HttpExchange ex) throws IOException {
        String path = URI.create(ex.getRequestURI().toString()).getPath();
        if (path.equals("/")) path = "/index.html";
        Path file = ROOT.resolve(path.substring(1)).normalize();
        if (!file.startsWith(ROOT) || file.startsWith(ROOT.resolve("server")) || !Files.isRegularFile(file)) {
            send(ex, 404, "text/plain; charset=utf-8", "Not found");
            return;
        }
        String name = file.getFileName().toString();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        byte[] bytes = Files.readAllBytes(file);
        ex.getResponseHeaders().set("Content-Type", CONTENT_TYPES.getOrDefault(ext, "application/octet-stream"));
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }

    /* ---------- helpers ---------- */
    static String readBody(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[16384];
        int n;
        while ((n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
            if (buf.size() > MAX_UPLOAD) return null;
        }
        return buf.toString(StandardCharsets.UTF_8);
    }

    static String find(String text, String regex) {
        Matcher m = Pattern.compile(regex).matcher(text);
        return m.find() ? m.group(1) : null;
    }

    static String json(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    static void send(HttpExchange ex, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) { out.write(bytes); }
    }

    static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }
}
