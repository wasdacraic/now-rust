/* global beforeAll, expect, it, jest */
const ms = require("ms");
const path = require("path");
const execa = require("execa");
const fs = require("fs-extra");
const fetch = require("node-fetch");

jest.setTimeout(ms("5m"));

async function deploy(vercelArgs = []) {
	const defaultArgs = ["--public"];

	if (process.env.VERCEL_TOKEN) {
		defaultArgs.push(`--token=${process.env.VERCEL_TOKEN}`);
	}

	const { stdout } = await execa("vercel", [...defaultArgs, ...vercelArgs]);

	console.log(`[Deployment] ${stdout}`);

	return stdout.trim();
}

async function packAndDeploy() {
	const pkgRoot = path.join(__dirname, "..");
	await execa("npm", ["build"]);

	const { stdout } = await execa("npm", ["pack", "--json"]);
	const [{ filename }] = JSON.parse(stdout);

	const builderPath = path.join(pkgRoot, filename);
	const builder = await deploy([builderPath, "--name=vercel-rust"]);

	return builder;
}

async function checkProbes(url, probes) {
	for (const probe of probes) {
		const response = await fetch(`${url}${probe.path}`);

		const status = response.status;
		const text = await response.text();

		if (probe.status) {
			expect(status).toBe(probe.status);
		}

		if (probe.mustContain) {
			expect(text).toContain(probe.mustContain);
		}
	}
}

async function testFixture(fixture, builder) {
	const fixturePath = path.join(__dirname, "fixtures", fixture);
	const { probes, ...tempConfig } = await fs.readJSON(
		path.join(fixturePath, "vercel.json")
	);

	if (tempConfig.builds) {
		if (!builder) {
			throw new Error(`Missing builder argument for ${fixture}`);
		}

		tempConfig.builds = JSON.parse(
			JSON.stringify(tempConfig.builds).replace(/nvercelow-rust/g, builder)
		);
	}

	const configPath = path.join(fixturePath, "vercel.temp.json");

	await fs.writeJSON(configPath, tempConfig);

	const url = await deploy([fixturePath, "--local-config", configPath]);

	await checkProbes(url, probes);

	return url;
}

describe("vercel-rust", () => {
	let builder;

	beforeAll(async () => {
		builder = await packAndDeploy();
	});

	it("Deploy 01-include-files", async () => {
		await testFixture("01-include-files", builder);
	});

	it("Deploy 02-with-utility", async () => {
		await testFixture("02-with-utility", builder);
	});

	it("Deploy 03-with-function", async () => {
		await testFixture("03-with-function", builder);
	});

	it("Deploy 04-with-parameter", async () => {
		await testFixture("04-with-parameter", builder);
	});

	it("Deploy 05-preconfigured-binary", async () => {
		await testFixture("05-preconfigured-binary", builder);
	});
});
