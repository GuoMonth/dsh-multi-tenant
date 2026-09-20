import { request } from "node:http";
const [socketPath, operation, id, allocationKey, identity, ...extra] =
  process.argv.slice(2);
if (
  !socketPath ||
  !id ||
  !["inspect", "delete"].includes(operation ?? "") ||
  extra.length ||
  !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
  (operation === "delete"
    ? !allocationKey || !identity
    : allocationKey || identity)
) {
  console.error(
    "Usage: node dist/admin-cli.js SOCKET inspect ENVIRONMENT | SOCKET delete ENVIRONMENT ALLOCATION_KEY IDENTITY",
  );
  process.exitCode = 1;
} else {
  const req = request(
    {
      socketPath,
      path: `/${operation}/${id}`,
      method: operation === "delete" ? "POST" : "GET",
      signal: AbortSignal.timeout(20000),
      headers:
        operation === "delete"
          ? {
              "x-allocation-key": allocationKey!,
              "x-instance-identity": identity!,
            }
          : {},
    },
    (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          response.destroy();
          process.exitCode = 1;
        } else chunks.push(chunk);
      });
      response.on("error", () => {
        console.error(
          "Admin response interrupted; inspect the original target before any write",
        );
        process.exitCode = 1;
      });
      response.on("end", () => {
        process.stdout.write(Buffer.concat(chunks).toString() + "\n");
        if (response.statusCode !== 200) process.exitCode = 1;
      });
    },
  );
  req.on("error", () => {
    console.error(
      "Admin request unavailable or outcome unknown; inspect the original target before any write",
    );
    process.exitCode = 1;
  });
  req.end();
}
