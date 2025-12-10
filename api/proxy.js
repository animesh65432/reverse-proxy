export const config = {
    runtime: "edge",
    regions: ["bom1"], // Mumbai region - closest to Rajasthan
    maxDuration: 25,
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

        // Retry logic with exponential backoff
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 22000); // 22s timeout

            try {
                console.log(`Attempt ${attempt}/${maxRetries} for ${targetUrl}`);

                const headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9,hi;q=0.8", // Added Hindi
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Cache-Control": "max-age=0",
                    "DNT": "1",
                };

                // Add referer for government sites
                if (url.hostname.includes(".gov.")) {
                    headers["Referer"] = `${url.protocol}//${url.hostname}/`;
                }

                const response = await fetch(targetUrl, {
                    method: "GET",
                    headers: headers,
                    redirect: "follow",
                    signal: controller.signal,
                    // Important: Some sites need credentials
                    // credentials: "omit",
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.error(`HTTP ${response.status} on attempt ${attempt}`);

                    // If it's a 5xx error, retry
                    if (response.status >= 500 && attempt < maxRetries) {
                        lastError = new Error(`Server error ${response.status}`);
                        await sleep(attempt * 1000); // Exponential backoff
                        continue;
                    }

                    return new Response(
                        JSON.stringify({
                            error: `Target server returned ${response.status}`,
                            status: response.status,
                            attempt: attempt
                        }),
                        {
                            status: 502,
                            headers: { "content-type": "application/json" }
                        }
                    );
                }

                const contentType = response.headers.get("content-type") || "text/html";
                const body = await response.text();

                // Check if we got actual content
                if (body.length < 500 && body.toLowerCase().includes("error")) {
                    console.error(`Suspicious response on attempt ${attempt}: ${body.substring(0, 200)}`);

                    if (attempt < maxRetries) {
                        lastError = new Error("Suspicious response received");
                        await sleep(attempt * 1000);
                        continue;
                    }
                }

                console.log(`Success on attempt ${attempt}, body length: ${body.length}`);

                return new Response(body, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type, Authorization",
                        "Cache-Control": "public, max-age=60", // Cache for 1 minute
                        "X-Proxy-Attempt": attempt.toString(),
                    },
                });

            } catch (fetchError) {
                clearTimeout(timeoutId);

                console.error(`Attempt ${attempt} failed:`, fetchError.message);
                lastError = fetchError;

                if (fetchError.name === "AbortError") {
                    console.error(`Timeout on attempt ${attempt}`);

                    // Retry on timeout
                    if (attempt < maxRetries) {
                        await sleep(attempt * 2000); // Longer wait for timeouts
                        continue;
                    }

                    return new Response(
                        JSON.stringify({
                            error: "Request timeout after multiple attempts",
                            timeout: true,
                            attempts: attempt
                        }),
                        {
                            status: 504,
                            headers: { "content-type": "application/json" }
                        }
                    );
                }

                // Network errors - retry
                if (fetchError.message.includes("network") ||
                    fetchError.message.includes("ECONNRESET") ||
                    fetchError.message.includes("ETIMEDOUT")) {

                    if (attempt < maxRetries) {
                        await sleep(attempt * 1500);
                        continue;
                    }
                }

                // Other errors - don't retry
                throw fetchError;
            }
        }

        // All retries exhausted
        return new Response(
            JSON.stringify({
                error: "All retry attempts failed",
                lastError: lastError?.message || "Unknown error",
                attempts: maxRetries
            }),
            {
                status: 502,
                headers: { "content-type": "application/json" }
            }
        );

    } catch (err) {
        console.error("Proxy error:", err);
        return new Response(
            JSON.stringify({
                error: err.message || "Internal proxy error",
                type: err.name,
                stack: process.env.NODE_ENV === "development" ? err.stack : undefined
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

// Helper function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}