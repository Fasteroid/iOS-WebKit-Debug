const os = require("node:os");
const fs = require("fs");
const http = require("node:http");
const cluster = require("node:cluster");
const path = require("path");
const which = require("which");
const { spawn } = require("child_process");
const CWD = path.resolve(__dirname);
const PATH_NODE = `${CWD}/node_modules/.bin`;
const PROXY_BIN = "ios_webkit_debug_proxy";
const WEBKIT_DIR = `${CWD}/WebKit/Source/WebInspectorUI/UserInterface`.replaceAll("/", path.sep);
const PROTO_DIR = WEBKIT_DIR + path.sep + "Protocol/Legacy/iOS".replaceAll("/", path.sep);
const MIME_TYPES = {
	bin: "application/octet-stream",
	html: "text/html; charset=UTF-8",
	js: "text/javascript",
	css: "text/css",
	png: "image/png",
	jpg: "image/jpeg",
	gif: "image/gif",
	ico: "image/x-icon",
	svg: "image/svg+xml",
};

let proxy = undefined;
let browser = undefined;

const proto_dirs = fs.readdirSync(PROTO_DIR).reverse();

const threads = Math.min(4, os.availableParallelism());
const port = 9920;
const proto = proto_dirs[0];

if (cluster.isPrimary) {
	console.log(`Primary ${process.pid} is running`);

	for (let i = 0; i < threads; i++) {
		cluster.fork();
	}

	cluster.on("exit", (worker, code, signal) => {
		console.log(`Worker (http) ${worker.process.pid} died (${code}, ${signal})`);
	});

	const frontend = `http://localhost:${port}/Main.html`;
	const proxy_url = `http://localhost:9221`;

	try {
		const proxy_bin = which.sync(PROXY_BIN, { path: `${PATH_NODE};${process.env.PATH}` });
		proxy = spawn(proxy_bin, ["-f", frontend], { stdio: "inherit" });
	} catch (reason) {
		console.error(`ERROR: ${reason.message}. Install or make it available in PATH before running the server.`);
		console.log(
			`Or, run below command while keeping this server running:
			${PROXY_BIN} -f ${frontend}`.replace(/\t\t/, "")
		);
	}

	setTimeout(() => {
		console.log(`▷ Webkit Frontend: ${frontend}`);
		console.log(`▷ iOS Debug Proxy: ${proxy_url} ◁ Start Here`);
	}, 1500);

	process.on("SIGINT", () => {
		console.log("Terminating all");
		proxy.kill(0);
		process.exit(0);
	});
	process.on("SIGHUP", () => {
		console.log("Terminating all");
		proxy.kill(0);
		process.exit(0);
	});
} else {
	http
		.createServer((req, res) => {
			let filePath = path.join(WEBKIT_DIR, req.url === "/Main.html" ? "Main.min.html" : req.url);
			const ext = path.extname(filePath).substring(1).toLowerCase();
			const mimeType = MIME_TYPES[ext] || MIME_TYPES.bin;
			if (req.url.includes("InspectorBackendCommands.js")) {
				filePath = filePath.replace("Protocol", `Protocol/Legacy/iOS/${proto}`.replaceAll("/", path.sep));
			}
			let shortPath = filePath.replace(new RegExp(".+" + WEBKIT_DIR.replaceAll(path.sep, ".")), "⌂");
			console.info(`${req.method}: ${req.url} (${shortPath})`);
			fs.readFile(filePath, (err, data) => {
				if (err) {
					res.writeHead(404, { "Content-Type": "text/plain" });
					res.end("404: File not found");
				} else {
					res.writeHead(200, { "Content-Type": mimeType });
					res.end(data);
				}
			});
		})
		.listen(port);

	console.log(`Worker (http) ${process.pid} started on port ${port}`);
}
