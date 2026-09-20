const https = require("node:https"),
  fs = require("node:fs");
const server = https.createServer(
  {
    key: fs.readFileSync("/tls/tls.key"),
    cert: fs.readFileSync("/tls/tls.crt"),
  },
  (req, res) => {
    const method = req.method;
    const drop = fs.existsSync("/tmp/mode")
      ? fs.readFileSync("/tmp/mode", "utf8").trim()
      : "";
    const upstream = https.request(
      "https://kubernetes.default.svc" + req.url,
      {
        method,
        headers: { ...req.headers, host: "kubernetes.default.svc" },
        ca: fs.readFileSync(
          "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
        ),
      },
      (r) => {
        if (
          (drop === "create" && method === "POST") ||
          (drop === "delete" && method === "DELETE")
        ) {
          console.log(
            JSON.stringify({
              method,
              status: r.statusCode,
              response: "dropped",
            }),
          );
          r.resume();
          r.on("end", () => res.destroy());
          return;
        }
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      console.log(JSON.stringify({ upstreamError: e.code }));
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  },
);
server.listen(8443, "0.0.0.0");
