export const config = {
    runtime: "edge",
    regions: ["bom1"], // Force Indian IP (Mumbai)
};

export default async function handler(request) {
    try {
        // Extract ?url= parameter
        const url = new URL(request.url).searchParams.get("url");

        if (!url) {
            return new Response(
                JSON.stringify({ error: "Missing ?url= parameter" }),
                { status: 400 }
            );
        }

        // Fetch target website using Indian IP
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
            },
        });

        const text = await response.text();

        // Send response to user
        return new Response(text, {
            status: response.status,
            headers: {
                "content-type": response.headers.get("content-type") || "text/html",
                "Access-Control-Allow-Origin": "*", // allow all origins
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
        });
    }
}
