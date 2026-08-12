const INTERACTIVE_ENGINE_PROTOCOL_VERSION = 3;

function write(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

write({ type: "engine_ready", protocolVersion: INTERACTIVE_ENGINE_PROTOCOL_VERSION, pid: process.pid });
write({ type: "engine_bound" });
const heartbeat = setInterval(() => write({ type: "engine_heartbeat", at: Date.now() }), 50);
heartbeat.unref?.();

let buffer = "";
process.stdin.on("data", (chunk) => {
	buffer += chunk.toString("utf8");
	let newline = buffer.indexOf("\n");
	while (newline !== -1) {
		const line = buffer.slice(0, newline);
		buffer = buffer.slice(newline + 1);
		newline = buffer.indexOf("\n");
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof parsed?.id !== "string") continue;
		write({
			type: "engine_request_accepted",
			requestId: parsed.id,
			command: typeof parsed.type === "string" ? parsed.type : "unknown",
		});
		if (process.env.ATOMIC_ADMISSION_HOLD !== "1") process.exit(0);
	}
});
