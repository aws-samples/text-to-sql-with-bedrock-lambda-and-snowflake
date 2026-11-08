/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {javascript} from "projen";


import {TypeScriptProject} from "projen/lib/typescript";
// @ts-ignore
import {PnpmWorkspace} from "./projenrc/pnpm";
// @ts-ignore
import {Nx} from "./projenrc/nx";

// @ts-ignore
import {overrideFormatting, zipLambdaFunction, zipRuntime} from "./projenrc/utils";
import {ReleaseTrigger} from "projen/lib/release";
import {NodeProject, TypeScriptModuleResolution} from "projen/lib/javascript";
import {ApprovalLevel, AwsCdkTypeScriptApp} from "projen/lib/awscdk";
import {TaskStep} from "projen/lib/task-model";
import {PrettierRc} from "./projenrc/prettierrc";
// @ts-ignore
import {pnpmOverrides} from "./projenrc/overrides";


const defaultReleaseBranch = "main";

// Pinned so `npx projen` is reproducible (it used to resolve the latest aws-cdk-lib from npm on every run).
const cdkVersion = "2.260.0";
const cdkCliVersion = "^2.1021.0";
const constructsVersion = "10.5.0";
const nodeVersion = "20.11.1";
const pnpmVersion = "9.0.5";
const jsiiReleaseVersion = "1.94.0";
const namespace = "@text-to-sql-with-athena-and-snowflake";
const main = async () => {
	const root = new TypeScriptProject({
		name: `${namespace}/root`,
		defaultReleaseBranch,
		packageManager: javascript.NodePackageManager.PNPM,
		projenCommand: "pnpm dlx projen",
		pnpmVersion,
		minNodeVersion: nodeVersion,
		projenrcTs: true,
		sampleCode: false,
		license: "MIT-0",
		copyrightPeriod: "2024",
		copyrightOwner: "Amazon.com, Inc. or its affiliates. All Rights Reserved.",
		tsconfig: {
			compilerOptions: {
				target: "ES2022",
				lib: ["ES2022"]
			},
			include: ["projen/**/*.ts"]
		},
		gitignore: [".DS_Store", ".idea", "*.iml", ".$*", "appsec", 'cdk.context.json', 'metadata.json','key-pair','.nx'],
		// Jest and eslint are disabled at the root as they will be
		// configured by each subproject. Using a single jest/eslint
		// config at the root is out of scope for this walkthrough
		eslint: false,
		jest: false,

		// Disable default github actions workflows generated
		// by projen as we will generate our own later (that uses nx)
		depsUpgradeOptions: {workflow: false},
		buildWorkflow: false,
		release: false,
		devDeps: [
			"@npmcli/arborist",
			"@types/npm-packlist",
			"@types/npmcli__arborist",
			`constructs@^${constructsVersion}`,
			"prettier",
			"projen",
		]
	});
	const infrastructure = new AwsCdkTypeScriptApp({
		name: `infrastructure`,
		packageName: `${namespace}/infrastructure`,
		jsiiReleaseVersion,
		outdir: "./packages/infrastructure",
		parent: root,
		cdkVersion,
		cdkCliVersion,
		constructsVersion,
		defaultReleaseBranch,
		licensed: false,
		packageManager: root.package.packageManager,
		pnpmVersion,
		projenCommand: root.projenCommand,
		minNodeVersion: root.minNodeVersion,
		projenrcTs: true,
		sampleCode: false,
		jest: false,
		github: false,
		eslint: true,
		requireApproval: ApprovalLevel.NEVER,
		appEntrypoint: "main.ts",
		tsconfig: {
			compilerOptions: {
				target: "ESNext",
				// cdk.json runs src/main.ts through ts-node, which needs CommonJS output.
				module: "CommonJS",
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				moduleResolution: TypeScriptModuleResolution.BUNDLER,
				strict: true,
				noEmit: true,
				isolatedModules: true
			}

		},

		eslintOptions: {

			dirs: ["src/runtime"],
			devdirs: ["test"],
			ignorePatterns: ["test/*"]
		},
		releaseTrigger: ReleaseTrigger.manual({}),
		majorVersion: 0,
		deps: [
			"@langchain/aws@^1.5.1",
			"@langchain/community@^1.1.29",
			"@langchain/core@^1.3.5",
			"langchain@^1.6.0",
			"@aws-sdk/client-ssm",
			"@aws-sdk/client-secrets-manager",
			"@aws-sdk/client-bedrock-runtime@^3.1161.0",
			"snowflake-sdk@^3.4.1",
			"@aws-lambda-powertools/logger",
			"@aws-lambda-powertools/metrics",
			"@aws-lambda-powertools/tracer",
			"@middy/core",
			"@types/aws-lambda",
			"@aws-sdk/client-glue",
			// No direct @smithy/types: nothing imports it, and the AWS SDK clients bring the version they need.
			"@opensearch-project/opensearch",
			"@aws-sdk/credential-provider-node"],
		devDeps: [
			"change-case@4.1.2",
			"aws-cdk-lib",
			"cdk-assets",
			"cdk-nag",
			"sinon",
			"@types/sinon",
			"vitest@^4.0.0",
			// Direct pins that keep the patched versions in the lockfile (see projenrc/overrides.ts).
			"axios@^1.20.0",
			"vite@^6.4.3"
		],

	});
	// Unit tests (vitest). The test task already runs eslint.
	infrastructure.testTask.exec("vitest run");
	new PrettierRc(root);
	new PnpmWorkspace(root);
	new Nx(root); // add nx to root
	root.package.addField("packageManager", `pnpm@${pnpmVersion}`);
	root.package.file.addOverride("pnpm.overrides", pnpmOverrides);
	// projen 0.104 pins v6.1.1; keep the v6.1.2 bump from #24 (pinned by commit SHA).
	root.github?.tryFindWorkflow("pull-request-lint")?.file?.addOverride(
		"jobs.validate.steps.0.uses",
		"amannn/action-semantic-pull-request@2252a14e810aa9b85c2d560bd7070c802206ecf6" // v6.1.2
	);
	root.npmrc.addConfig("auto-install-peers", "true");
	root.tasks.tryFind("compile")?.removeStep(0);
	root.tasks.addTask("deploy", {
		receiveArgs: true
	});
	root.tasks.addTask("synth", {
		receiveArgs: true
	});
	root.tasks.addTask("destroy", {
		receiveArgs: true
	});
	root.tasks.addTask("prettier", {
		receiveArgs: true
	});
	overrideFormatting(infrastructure);

	[infrastructure].forEach(value => {

		root.tasks.tryFind("synth")?.exec(`nx synth ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("compile")?.exec(`nx build ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("prettier")?.exec(`nx prettier ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("deploy")?.exec(`nx deploy ${value.package.packageName}`, {
			receiveArgs: true
		});
		root.tasks.tryFind("destroy")?.exec(`nx destroy ${value.package.packageName}`, {
			receiveArgs: true
		});
	});
	await zipRuntime(infrastructure, [
		namespace,
		"@aws-lambda-powertools",
		"@aws-sdk",
		"@smithy",
		"@types",
		"constructs"], (p: NodeProject, esBuildExternal: string) => {
		const steps: TaskStep[] = [
			{
				exec: "rm -Rf ./lib/runtime"
			},
			{
				exec: "rm -Rf ./dist"
			},
			{
				exec: "mkdir ./dist"
			},
			...zipLambdaFunction("src/runtime/handlers/TextToSql.ts", esBuildExternal),
			...zipLambdaFunction("src/runtime/handlers/IndexTables.ts", esBuildExternal),
			{
				// Runs in the package dir; resolve dist/ before cd so no absolute path is baked into tasks.json.
				exec: `ZIP_OUT="$PWD/dist/lambdas-layer.zip" && cd /tmp/${p.name} && zip -r "$ZIP_OUT" ./nodejs`
			}
		];
		return steps;
	});
	root.addTask("generate-key-pair",{
		steps:[
			// Steps run in the root project directory; paths stay relative so tasks.json is portable.
			{
				exec: "mkdir -p ./key-pair"
			},
			{
				say: "Generating private key",
				exec: "openssl genrsa 2048 | openssl pkcs8 -topk8 -v2 des3 -inform PEM -out key-pair/snowflake.p8 -passout pass:'' -passin pass:'' -nocrypt"
			},
			{
				say: "Generating public key",
				exec: "openssl rsa -in key-pair/snowflake.p8 -pubout -out key-pair/snowflake.pub -passin pass:''"
			},
			{
				say: "Store this private key in the stack's Secrets Manager secret (see the README)",
				exec: "cat key-pair/snowflake.p8"
			},
			{
				say: "Assign this value to your snowflake user (https://docs.snowflake.com/en/user-guide/key-pair-auth#assign-the-public-key-to-a-snowflake-user)",
				exec: "cat key-pair/snowflake.pub"
			},

		]
	})
	root.synth();
};

main().then(() => {

}).catch(reason => {
	throw new Error(reason);
});