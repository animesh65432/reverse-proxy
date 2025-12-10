export const config = {
    runtime: "edge",
    regions: ["bom1"], // Mumbai region
    maxDuration: 25, // Set max execution time (Edge has 25s limit on free tier)
};

export default async function handler(request) {
    try {
        const targetUrl = new URL(request.url).searchParams.get("url");

        if (!targetUrl) {
            return new Response(
                JSON.stringify({ error: "Missing ?url= parameter" }),
                { status: 400, headers: { "content-type": "application/json" } }
            );
        }

        // Validate URL
        let url;
        try {
            url = new URL(targetUrl);
        } catch {
            return new Response(
                JSON.stringify({ error: "Invalid URL provided" }),
                { status: 400, headers: { "content-type": "application/json" } }
            );
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

        try {
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            };

            // Fetch with timeout
            const response = await fetch(targetUrl, {
                method: "GET",
                headers: headers,
                redirect: "follow",
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Check if response is ok
            if (!response.ok) {
                return new Response(
                    JSON.stringify({
                        error: `Target server returned ${response.status}`,
                        status: response.status
                    }),
                    {
                        status: 502,
                        headers: { "content-type": "application/json" }
                    }
                );
            }

            const contentType = response.headers.get("content-type") || "text/html";
            const body = await response.text();

            return new Response(body, {
                status: 200,
                headers: {
                    "Content-Type": contentType,
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                },
            });

        } catch (fetchError) {
            clearTimeout(timeoutId);

            if (fetchError.name === "AbortError") {
                return new Response(
                    JSON.stringify({
                        error: "Request timeout - server took too long to respond",
                        timeout: true
                    }),
                    {
                        status: 504,
                        headers: { "content-type": "application/json" }
                    }
                );
            }

            throw fetchError;
        }

    } catch (err) {
        console.error("Proxy error:", err);

        return new Response(
            JSON.stringify({
                error: err.message || "Internal proxy error",
                type: err.name
            }),
            {
                status: 500,
                headers: {
                    "content-type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
            }
        );
    }
}
