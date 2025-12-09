export const config = {
    runtime: "edge",
    regions: ["bom1"], // Mumbai region
};

export default async function handler(request) {
    try {
        const targetUrl = new URL(request.url).searchParams.get("url");

        if (!targetUrl) {
            return new Response(
                JSON.stringify({ error: "Missing ?url= parameter" }),
                { status: 400 }
            );
        }

        // Forward headers like a real browser
        const headers = {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": targetUrl,
            "Connection": "keep-alive",
        };

        // Fetch target site
        const response = await fetch(targetUrl, {
            method: "GET",
            headers: headers,
            redirect: "follow", // follow HTTP redirects
        });

        const body = await response.text();

        return new Response(body, {
            status: response.status,
            headers: {
                "content-type": response.headers.get("content-type") || "text/html",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    }
}
